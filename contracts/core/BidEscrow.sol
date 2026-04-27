// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DepositStatus} from "../interfaces/ISealTender.sol";

/**
 * @title BidEscrow
 * @notice Holds ETH escrow deposits for tender bidders.
 */
/// @dev Minimal interface for the permissionless refund check — keeps BidEscrow
///      decoupled from the full EncryptedTender ABI.
interface ITenderStateReader {
    function state() external view returns (uint8);
}

contract BidEscrow is Ownable2Step, ReentrancyGuard {
    /// @notice TenderState.Cancelled enum value (matches ISealTender.sol).
    uint8 public constant TENDER_STATE_CANCELLED = 5;

    // --- State ---
    mapping(uint256 => uint256) public requiredDeposit;
    mapping(uint256 => mapping(address => uint256)) public deposits;
    mapping(uint256 => mapping(address => DepositStatus)) public depositStatus;
    mapping(uint256 => uint256) public totalEscrow;
    mapping(address => bool) public authorizedCallers;
    /// @notice Per-tender mapping of tenderId → tender contract address. Set by
    ///         authorized callers (factory) so {claimRefund} can verify the
    ///         tender is in {TenderState.Cancelled} before releasing funds.
    mapping(uint256 => address) public tenderOf;

    // --- Events ---
    event EscrowDeposited(uint256 indexed tenderId, address indexed bidder, uint256 amount);
    event EscrowReleased(uint256 indexed tenderId, address indexed bidder, uint256 amount);
    event EscrowRefunded(uint256 indexed tenderId, address indexed bidder, uint256 amount);
    event EscrowFrozen(uint256 indexed tenderId, address indexed bidder);
    event EscrowUnfrozen(uint256 indexed tenderId, address indexed bidder);
    event EscrowSlashed(
        uint256 indexed tenderId,
        address indexed bidder,
        address recipient,
        uint256 amount
    );
    event RequiredDepositSet(uint256 indexed tenderId, uint256 amount);
    event CallerAuthorized(address indexed caller);
    event CallerDeauthorized(address indexed caller);
    event TenderRecorded(uint256 indexed tenderId, address indexed tender);
    event RefundClaimed(uint256 indexed tenderId, address indexed bidder, uint256 amount);

    // --- Errors ---
    error InsufficientDeposit();
    error NotAuthorized();
    error DepositNotActive();
    error DepositFrozen();
    error DepositAlreadyExists();
    error TransferFailed();
    error ZeroAddress();
    error NoDeposit();
    error TenderNotConfigured();
    error TenderNotCancelled();
    error TenderUnknown();

    // --- Modifiers ---
    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender] && msg.sender != owner()) {
            revert NotAuthorized();
        }
        _;
    }

    constructor() Ownable(msg.sender) {}

    // --- Admin ---

    function authorizeCaller(address caller) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        authorizedCallers[caller] = true;
        emit CallerAuthorized(caller);
    }

    function deauthorizeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
        emit CallerDeauthorized(caller);
    }

    function setRequiredDeposit(uint256 tenderId, uint256 amount) external onlyAuthorized {
        requiredDeposit[tenderId] = amount;
        emit RequiredDepositSet(tenderId, amount);
    }

    /// @notice Records the tender contract address for `tenderId`. Required so
    ///         {claimRefund} can verify the tender is in {TenderState.Cancelled}
    ///         before releasing funds permissionlessly. Called by the factory
    ///         immediately after deploying a new tender.
    function setTenderAddress(uint256 tenderId, address tender) external onlyAuthorized {
        if (tender == address(0)) revert ZeroAddress();
        tenderOf[tenderId] = tender;
        emit TenderRecorded(tenderId, tender);
    }

    // --- Core ---

    function deposit(uint256 tenderId) external payable {
        if (depositStatus[tenderId][msg.sender] != DepositStatus.None) {
            revert DepositAlreadyExists();
        }
        uint256 required = requiredDeposit[tenderId];
        // Reject deposits to tenders that were never configured by the factory.
        // Without this, ETH could be locked under arbitrary tenderIds with no
        // contract able to release/refund/slash it.
        if (required == 0) revert TenderNotConfigured();
        if (msg.value < required) revert InsufficientDeposit();

        deposits[tenderId][msg.sender] = msg.value;
        depositStatus[tenderId][msg.sender] = DepositStatus.Active;
        totalEscrow[tenderId] += msg.value;

        emit EscrowDeposited(tenderId, msg.sender, msg.value);
    }

    function release(uint256 tenderId, address bidder) external onlyAuthorized nonReentrant {
        _requireActive(tenderId, bidder);
        uint256 amount = deposits[tenderId][bidder];
        if (amount == 0) revert NoDeposit();

        depositStatus[tenderId][bidder] = DepositStatus.Released;
        deposits[tenderId][bidder] = 0;
        totalEscrow[tenderId] -= amount;

        (bool success, ) = payable(bidder).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit EscrowReleased(tenderId, bidder, amount);
    }

    function refund(uint256 tenderId, address bidder) external onlyAuthorized nonReentrant {
        _requireActive(tenderId, bidder);
        uint256 amount = deposits[tenderId][bidder];
        if (amount == 0) revert NoDeposit();

        depositStatus[tenderId][bidder] = DepositStatus.Refunded;
        deposits[tenderId][bidder] = 0;
        totalEscrow[tenderId] -= amount;

        (bool success, ) = payable(bidder).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit EscrowRefunded(tenderId, bidder, amount);
    }

    /// @notice Permissionless refund path: any depositor can pull back their
    ///         escrow once the tender has entered {TenderState.Cancelled}.
    ///         Protects bidders if the tender contract goes silent and never
    ///         calls {refund} for them. Frozen deposits are intentionally
    ///         excluded (they are subject to dispute / slashing).
    function claimRefund(uint256 tenderId) external nonReentrant {
        address tender = tenderOf[tenderId];
        if (tender == address(0)) revert TenderUnknown();
        if (ITenderStateReader(tender).state() != TENDER_STATE_CANCELLED) {
            revert TenderNotCancelled();
        }
        _requireActive(tenderId, msg.sender);

        uint256 amount = deposits[tenderId][msg.sender];
        if (amount == 0) revert NoDeposit();

        depositStatus[tenderId][msg.sender] = DepositStatus.Refunded;
        deposits[tenderId][msg.sender] = 0;
        totalEscrow[tenderId] -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit EscrowRefunded(tenderId, msg.sender, amount);
        emit RefundClaimed(tenderId, msg.sender, amount);
    }

    function freeze(uint256 tenderId, address bidder) external onlyAuthorized {
        if (depositStatus[tenderId][bidder] != DepositStatus.Active) {
            revert DepositNotActive();
        }
        depositStatus[tenderId][bidder] = DepositStatus.Frozen;
        emit EscrowFrozen(tenderId, bidder);
    }

    function unfreeze(uint256 tenderId, address bidder) external onlyAuthorized {
        if (depositStatus[tenderId][bidder] != DepositStatus.Frozen) {
            revert DepositFrozen();
        }
        depositStatus[tenderId][bidder] = DepositStatus.Active;
        emit EscrowUnfrozen(tenderId, bidder);
    }

    function slash(
        uint256 tenderId,
        address bidder,
        address recipient
    ) external onlyAuthorized nonReentrant {
        DepositStatus status = depositStatus[tenderId][bidder];
        if (status != DepositStatus.Active && status != DepositStatus.Frozen) {
            revert DepositNotActive();
        }
        if (recipient == address(0)) revert ZeroAddress();

        uint256 amount = deposits[tenderId][bidder];
        if (amount == 0) revert NoDeposit();

        depositStatus[tenderId][bidder] = DepositStatus.Slashed;
        deposits[tenderId][bidder] = 0;
        totalEscrow[tenderId] -= amount;

        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit EscrowSlashed(tenderId, bidder, recipient, amount);
    }

    // --- Views ---

    function getDepositStatus(
        uint256 tenderId,
        address bidder
    ) external view returns (DepositStatus) {
        return depositStatus[tenderId][bidder];
    }

    function getDeposit(uint256 tenderId, address bidder) external view returns (uint256) {
        return deposits[tenderId][bidder];
    }

    // --- Internal ---

    function _requireActive(uint256 tenderId, address bidder) internal view {
        DepositStatus status = depositStatus[tenderId][bidder];
        if (status == DepositStatus.Frozen) revert DepositFrozen();
        if (status != DepositStatus.Active) revert DepositNotActive();
    }
}
