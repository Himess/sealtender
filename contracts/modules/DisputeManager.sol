// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Dispute, DisputeType, DisputeStatus} from "../interfaces/ISealTender.sol";
import {BidEscrow} from "../core/BidEscrow.sol";
import {BidderRegistry} from "../identity/BidderRegistry.sol";

/**
 * @title DisputeManager
 * @notice Handles disputes between companies, citizens, and court orders.
 */
contract DisputeManager is Ownable2Step, ReentrancyGuard {
    // --- State ---
    BidEscrow public escrow;
    address public courtAuthority;
    address public municipality;
    BidderRegistry public registry;

    uint256 public disputeCount;
    uint256 public constant COMPLAINT_STAKE_BPS = 500; // 5% of escrow
    uint256 public constant BPS_BASE = 10000;
    uint256 public constant DISPUTE_TIMEOUT = 30 days;

    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => uint256[]) public tenderDisputes;
    mapping(uint256 => uint256) public disputeCreatedAt;

    // --- Events ---
    event DisputeFiled(
        uint256 indexed disputeId,
        uint256 indexed tenderId,
        address complainant,
        address accused
    );
    event DisputeResolved(uint256 indexed disputeId, DisputeStatus resolution);
    event StakeBurned(
        uint256 indexed disputeId,
        address complainant,
        address recipient,
        uint256 amount
    );

    // --- Errors ---
    error InsufficientStake(uint256 required, uint256 provided);
    error InvalidDisputeId(uint256 disputeId);
    error DisputeAlreadyResolved(uint256 disputeId);
    error NotCourtAuthority();
    error ZeroAddress();
    error StakeReturnFailed();
    error StakeForfeited();

    constructor(address _escrow, address _municipality, address _registry) Ownable(msg.sender) {
        if (_escrow == address(0) || _municipality == address(0) || _registry == address(0)) {
            revert ZeroAddress();
        }
        escrow = BidEscrow(_escrow);
        municipality = _municipality;
        registry = BidderRegistry(_registry);
    }

    // --- Admin ---

    function setCourtAuthority(address _courtAuthority) external onlyOwner {
        if (_courtAuthority == address(0)) revert ZeroAddress();
        courtAuthority = _courtAuthority;
    }

    // --- Dynamic Stake ---

    function getComplaintStake(uint256 tenderId) public view returns (uint256) {
        uint256 escrowAmount = escrow.requiredDeposit(tenderId);
        uint256 stake = (escrowAmount * COMPLAINT_STAKE_BPS) / BPS_BASE;
        // Minimum 0.001 ETH to prevent zero-stake spam on low-escrow tenders
        uint256 minStake = 0.001 ether;
        return stake > minStake ? stake : minStake;
    }

    // --- Filing ---

    function fileCompanyComplaint(
        uint256 tenderId,
        address accused,
        string calldata reason
    ) external payable returns (uint256) {
        uint256 requiredStake = getComplaintStake(tenderId);
        if (msg.value < requiredStake) revert InsufficientStake(requiredStake, msg.value);
        return _fileDispute(tenderId, accused, DisputeType.Company, msg.value, reason);
    }

    function fileCitizenComplaint(
        uint256 tenderId,
        address accused,
        string calldata reason
    ) external returns (uint256) {
        return _fileDispute(tenderId, accused, DisputeType.Citizen, 0, reason);
    }

    function executeCourtOrder(
        uint256 tenderId,
        address accused,
        string calldata reason,
        bool shouldFreeze
    ) external returns (uint256) {
        if (msg.sender != courtAuthority) revert NotCourtAuthority();

        uint256 disputeId = _fileDispute(tenderId, accused, DisputeType.CourtOrder, 0, reason);

        if (shouldFreeze) {
            escrow.freeze(tenderId, accused);
            disputes[disputeId].status = DisputeStatus.Frozen;
        } else {
            disputes[disputeId].status = DisputeStatus.Dismissed;
        }

        emit DisputeResolved(disputeId, disputes[disputeId].status);
        return disputeId;
    }

    // --- Resolution ---

    function resolveDispute(
        uint256 disputeId,
        DisputeStatus resolution
    ) external onlyOwner nonReentrant {
        if (disputeId >= disputeCount) revert InvalidDisputeId(disputeId);
        Dispute storage d = disputes[disputeId];
        if (
            d.status != DisputeStatus.Open &&
            d.status != DisputeStatus.Investigating &&
            d.status != DisputeStatus.Frozen
        ) {
            revert DisputeAlreadyResolved(disputeId);
        }

        d.status = resolution;

        if (resolution == DisputeStatus.Slashed) {
            // Slash the accused's escrow to municipality
            escrow.slash(d.tenderId, d.accused, municipality);

            // Record slash in registry if authorized
            if (registry.authorizedCallers(address(this))) {
                registry.recordSlash(d.accused);
            }

            // Return stake to complainant
            if (d.stake > 0) {
                (bool success, ) = payable(d.complainant).call{value: d.stake}("");
                if (!success) revert StakeReturnFailed();
            }
        } else if (resolution == DisputeStatus.Dismissed) {
            // Stake burned to municipality (not returned!)
            if (d.stake > 0) {
                (bool success, ) = payable(municipality).call{value: d.stake}("");
                if (!success) revert StakeForfeited();
                emit StakeBurned(disputeId, d.complainant, municipality, d.stake);
            }
        }

        emit DisputeResolved(disputeId, resolution);
    }

    // --- Views ---

    function timeoutDispute(uint256 disputeId) external nonReentrant {
        Dispute storage d = disputes[disputeId];
        if (d.complainant == address(0)) revert InvalidDisputeId(disputeId);
        if (d.status != DisputeStatus.Open && d.status != DisputeStatus.Investigating) {
            revert DisputeAlreadyResolved(disputeId);
        }
        require(block.timestamp >= disputeCreatedAt[disputeId] + DISPUTE_TIMEOUT, "Not timed out yet");
        d.status = DisputeStatus.Dismissed;
        // Return stake to complainant on timeout (not burn — timeout is not their fault)
        if (d.disputeType == DisputeType.Company && d.stake > 0) {
            (bool ok,) = payable(d.complainant).call{value: d.stake}("");
            if (!ok) revert StakeReturnFailed();
        }
        emit DisputeResolved(disputeId, d.status);
    }

    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        if (disputeId >= disputeCount) revert InvalidDisputeId(disputeId);
        return disputes[disputeId];
    }

    function getDisputesByTender(uint256 tenderId) external view returns (uint256[] memory) {
        return tenderDisputes[tenderId];
    }

    // --- Internal ---

    function _fileDispute(
        uint256 tenderId,
        address accused,
        DisputeType disputeType,
        uint256 stake,
        string calldata reason
    ) internal returns (uint256) {
        uint256 disputeId = disputeCount++;

        disputes[disputeId] = Dispute({
            complainant: msg.sender,
            accused: accused,
            tenderId: tenderId,
            disputeType: disputeType,
            status: DisputeStatus.Open,
            stake: stake,
            reason: reason
        });

        tenderDisputes[tenderId].push(disputeId);
        disputeCreatedAt[disputeId] = block.timestamp;

        emit DisputeFiled(disputeId, tenderId, msg.sender, accused);
        return disputeId;
    }
}
