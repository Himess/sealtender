// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EncryptedTender} from "./EncryptedTender.sol";
import {BidderRegistry} from "../identity/BidderRegistry.sol";
import {BidEscrow} from "./BidEscrow.sol";
import {TenderConfig, TenderSpecification} from "../interfaces/ISealTender.sol";

/**
 * @title TenderFactory
 * @notice Creates and tracks tender instances. Auto-authorizes tenders in registry and escrow.
 */
contract TenderFactory is Ownable2Step {
    // --- State ---
    address public registry;
    address public escrow;
    address public disputeManager;
    address public escalation;
    address public collisionDetector;

    uint256 public tenderCount;
    mapping(uint256 => address) public tenders;
    mapping(uint256 => TenderConfig) public tenderConfigs;
    mapping(uint256 => TenderSpecification) public tenderSpecs;

    // --- Events ---
    event TenderCreated(uint256 indexed tenderId, address tenderContract, string description);
    event DisputeManagerSet(address indexed dm);
    event EscalationSet(address indexed esc);
    event CollisionDetectorSet(address indexed cd);

    // --- Errors ---
    error ZeroAddress();

    constructor(address _registry, address _escrow) Ownable(msg.sender) {
        if (_registry == address(0) || _escrow == address(0)) revert ZeroAddress();
        registry = _registry;
        escrow = _escrow;
    }

    // --- Create ---

    function createTender(TenderConfig calldata _config, TenderSpecification calldata _spec) external onlyOwner returns (uint256 tenderId, address tenderAddress) {
        require(_config.deadline > block.timestamp, "Deadline must be future");
        require(_config.maxBidders > 0, "Must allow at least 1 bidder");

        tenderId = tenderCount++;
        EncryptedTender tender = new EncryptedTender(tenderId, _config, _spec, registry, escrow);
        tenderAddress = address(tender);

        tenders[tenderId] = tenderAddress;
        tenderConfigs[tenderId] = _config;
        tenderSpecs[tenderId] = _spec;

        // Set required deposit in escrow
        if (_config.escrowAmount > 0) {
            BidEscrow(escrow).setRequiredDeposit(tenderId, _config.escrowAmount);
        }

        // Auto-authorize the tender contract in registry
        BidderRegistry(registry).addAuthorizedCaller(tenderAddress);

        emit TenderCreated(tenderId, tenderAddress, _config.description);
    }

    // --- Config ---

    function setDisputeManager(address _dm) external onlyOwner {
        if (_dm == address(0)) revert ZeroAddress();
        disputeManager = _dm;
        emit DisputeManagerSet(_dm);
    }

    function setEscalation(address _esc) external onlyOwner {
        if (_esc == address(0)) revert ZeroAddress();
        escalation = _esc;
        emit EscalationSet(_esc);
    }

    function setCollisionDetector(address _cd) external onlyOwner {
        if (_cd == address(0)) revert ZeroAddress();
        collisionDetector = _cd;
        emit CollisionDetectorSet(_cd);
    }

    // --- Views ---

    function getTender(uint256 id) external view returns (address) {
        return tenders[id];
    }

    function getTenderConfig(uint256 id) external view returns (TenderConfig memory) {
        return tenderConfigs[id];
    }

    function getTenderSpec(uint256 id) external view returns (TenderSpecification memory) {
        return tenderSpecs[id];
    }

    function getAllTenders() external view returns (address[] memory) {
        address[] memory result = new address[](tenderCount);
        for (uint256 i = 0; i < tenderCount; i++) {
            result[i] = tenders[i];
        }
        return result;
    }

    function getTenders(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory) {
        if (offset >= tenderCount) {
            return new address[](0);
        }
        uint256 end = offset + limit;
        if (end > tenderCount) end = tenderCount;
        uint256 count = end - offset;

        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = tenders[offset + i];
        }
        return result;
    }
}
