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
contract BidEscrow is Ownable2Step, ReentrancyGuard {
    // --- State ---
    mapping(uint256 => uint256) public requiredDeposit;
    mapping(uint256 => mapping(address => uint256)) public deposits;
    mapping(uint256 => mapping(address => DepositStatus)) public depositStatus;
    mapping(uint256 => uint256) public totalEscrow;
    mapping(address => bool) public authorizedCallers;

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

    // --- Errors ---
    error InsufficientDeposit();
    error NotAuthorized();
    error DepositNotActive();
    error DepositFrozen();
    error DepositAlreadyExists();
    error TransferFailed();
    error ZeroAddress();
    error NoDeposit();

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
    }

    function deauthorizeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
    }

    function setRequiredDeposit(uint256 tenderId, uint256 amount) external onlyAuthorized {
        requiredDeposit[tenderId] = amount;
        emit RequiredDepositSet(tenderId, amount);
    }

    // --- Core ---

    function deposit(uint256 tenderId) external payable {
        if (depositStatus[tenderId][msg.sender] != DepositStatus.None) {
            revert DepositAlreadyExists();
        }
        uint256 required = requiredDeposit[tenderId];
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
