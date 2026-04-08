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
    uint256 public constant COMPLAINT_STAKE = 0.01 ether;

    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => uint256[]) public tenderDisputes;

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
    error InsufficientStake();
    error InvalidDisputeId();
    error DisputeAlreadyResolved();
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

    // --- Filing ---

    function fileCompanyComplaint(
        uint256 tenderId,
        address accused,
        string calldata reason
    ) external payable returns (uint256) {
        if (msg.value < COMPLAINT_STAKE) revert InsufficientStake();
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
        if (disputeId >= disputeCount) revert InvalidDisputeId();
        Dispute storage d = disputes[disputeId];
        if (
            d.status != DisputeStatus.Open &&
            d.status != DisputeStatus.Investigating &&
            d.status != DisputeStatus.Frozen
        ) {
            revert DisputeAlreadyResolved();
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

    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        if (disputeId >= disputeCount) revert InvalidDisputeId();
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

        emit DisputeFiled(disputeId, tenderId, msg.sender, accused);
        return disputeId;
    }
}
