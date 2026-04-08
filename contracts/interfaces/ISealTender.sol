// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title ISealTender
 * @notice Shared interfaces, structs, enums, and events for the SealTender protocol.
 */

// --- Enums ---

enum TenderState {
    Created,
    Bidding,
    Evaluating,
    Revealed,
    Completed,
    Cancelled
}

enum DisputeType {
    Company,
    Citizen,
    CourtOrder
}

enum DisputeStatus {
    Open,
    Investigating,
    Slashed,
    Frozen,
    Dismissed
}

enum DepositStatus {
    None,
    Active,
    Frozen,
    Released,
    Refunded,
    Slashed
}

// --- Structs ---

struct TenderConfig {
    string description;
    uint256 deadline;
    uint32 weightYears;
    uint32 weightProjects;
    uint32 weightBond;
    uint32 minYears;
    uint32 minProjects;
    uint64 minBond;
    uint256 escrowAmount;
    uint256 maxBidders;
    uint256 minReputation;
}

struct Dispute {
    address complainant;
    address accused;
    uint256 tenderId;
    DisputeType disputeType;
    DisputeStatus status;
    uint256 stake;
    string reason;
}

struct EscalationRule {
    bytes32 materialId;
    uint256 baselinePrice;
    uint256 thresholdPercent;
    uint256 capPercent;
    uint256 periodSeconds;
    uint256 lastEvaluated;
}

// --- Events Interface ---

interface ISealTenderEvents {
    event TenderCreated(uint256 indexed tenderId, address tenderContract, string description);
    event BidSubmitted(uint256 indexed tenderId, address indexed bidder);
    event BidUpdated(uint256 indexed tenderId, address indexed bidder, uint256 version);
    event EvaluationCompleted(uint256 indexed tenderId);
    event WinnerRevealed(uint256 indexed tenderId, address winner, uint256 price);
    event EscrowDeposited(uint256 indexed tenderId, address indexed bidder, uint256 amount);
    event EscrowReleased(uint256 indexed tenderId, address indexed bidder, uint256 amount);
    event EscrowRefunded(uint256 indexed tenderId, address indexed bidder, uint256 amount);
    event EscrowFrozen(uint256 indexed tenderId, address indexed bidder);
    event EscrowUnfrozen(uint256 indexed tenderId, address indexed bidder);
    event EscrowSlashed(uint256 indexed tenderId, address indexed bidder, address recipient, uint256 amount);
    event DisputeFiled(uint256 indexed disputeId, uint256 indexed tenderId, address complainant, address accused);
    event DisputeResolved(uint256 indexed disputeId, DisputeStatus resolution);
    event ReputationUpdated(address indexed bidder, uint256 newScore);
    event CollisionDetected(uint256 indexed tenderId);
    event EscalationTriggered(uint256 indexed tenderId, bytes32 materialId, uint256 extraPayment);
}
