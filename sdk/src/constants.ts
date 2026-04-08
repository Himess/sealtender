/**
 * @module constants
 * @description Default contract addresses, ABIs, and chain configuration
 * for the SealTender protocol on Zama Sepolia.
 */

import { ContractAddresses } from "./types";

// ─── Chain Configuration ────────────────────────────────────────────────────

/** Ethereum Sepolia chain ID */
export const SEPOLIA_CHAIN_ID = 11155111;

/** Zama FHE KMS contract on Sepolia */
export const KMS_CONTRACT_ADDRESS = "0x9D6891A6240D6130c54ae243d8005063D05fE14b";

/** Zama FHE ACL contract on Sepolia */
export const ACL_CONTRACT_ADDRESS = "0xFee8407e2f5e3Ee68ad77cAE98c434e637f516e0";

/** Zama Gateway URL for decryption requests */
export const GATEWAY_URL = "https://gateway.sepolia.zama.ai/";

// ─── Default Contract Addresses (Sepolia) ───────────────────────────────────

export const DEFAULT_ADDRESSES: ContractAddresses = {
  factory: "0x0000000000000000000000000000000000000000",
  escrow: "0x0000000000000000000000000000000000000000",
  registry: "0x0000000000000000000000000000000000000000",
  disputeManager: "0x0000000000000000000000000000000000000000",
  escalation: "0x0000000000000000000000000000000000000000",
  collisionDetector: "0x0000000000000000000000000000000000000000",
  cusdc: "0x0000000000000000000000000000000000000000",
};

// ─── ABIs (Human-Readable Format) ───────────────────────────────────────────

export const FACTORY_ABI = [
  "function createTender(tuple(string description, uint256 deadline, uint32 weightYears, uint32 weightProjects, uint32 weightBond, uint32 minYears, uint32 minProjects, uint64 minBond, uint256 escrowAmount, uint256 maxBidders, uint256 minReputation) config) external returns (address)",
  "function getTenders(uint256 start, uint256 end) external view returns (address[])",
  "function getTenderCount() external view returns (uint256)",
  "function tenderById(uint256 tenderId) external view returns (address)",
  "function registry() external view returns (address)",
  "function disputeManager() external view returns (address)",
  "function escalation() external view returns (address)",
  "function collisionDetector() external view returns (address)",
  "function setDisputeManager(address dm) external",
  "function setEscalation(address esc) external",
  "function setCollisionDetector(address cd) external",
  "event TenderCreated(uint256 indexed tenderId, address tenderContract, string description)",
  "event DisputeManagerSet(address indexed disputeManager)",
  "event EscalationSet(address indexed escalation)",
  "event CollisionDetectorSet(address indexed collisionDetector)",
];

export const TENDER_ABI = [
  "function submitBid(bytes encPrice, bytes encYears, bytes encProjects, bytes encBond) external",
  "function updateBid(bytes encPrice, bytes encYears, bytes encProjects, bytes encBond) external",
  "function startEvaluation() external",
  "function submitScore(uint256 bidderIndex, uint256 score) external",
  "function completeEvaluation() external",
  "function revealWinner(uint256 winnerIndex, uint256 price) external",
  "function cancel() external",
  "function pause() external",
  "function unpause() external",
  "function getBidders(uint256 start, uint256 end) external view returns (address[])",
  "function getBidderCount() external view returns (uint256)",
  "function getScore(uint256 index) external view returns (uint256)",
  "function tenderId() external view returns (uint256)",
  "function state() external view returns (uint8)",
  "function winner() external view returns (address)",
  "function winnerPrice() external view returns (uint256)",
  "function evaluatedCount() external view returns (uint256)",
  "function config() external view returns (string description, uint256 deadline, uint32 weightYears, uint32 weightProjects, uint32 weightBond, uint32 minYears, uint32 minProjects, uint64 minBond, uint256 escrowAmount, uint256 maxBidders, uint256 minReputation)",
  "function bids(address bidder) external view returns (bytes encPrice, bytes encYears, bytes encProjects, bytes encBond, uint256 version, bool exists)",
  "event BidSubmitted(address indexed bidder)",
  "event BidUpdated(address indexed bidder, uint256 version)",
  "event EvaluationStarted()",
  "event EvaluationCompleted()",
  "event WinnerRevealed(address winner, uint256 price)",
  "event TenderCancelled()",
];

export const ESCROW_ABI = [
  "function deposit(uint256 tenderId) external payable",
  "function release(uint256 tenderId, address bidder) external",
  "function refund(uint256 tenderId, address bidder) external",
  "function freeze(uint256 tenderId, address bidder) external",
  "function unfreeze(uint256 tenderId, address bidder) external",
  "function slash(uint256 tenderId, address bidder, address recipient) external",
  "function setRequiredDeposit(uint256 tenderId, uint256 amount) external",
  "function authorizeCaller(address caller) external",
  "function deauthorizeCaller(address caller) external",
  "function getDeposit(uint256 tenderId, address bidder) external view returns (uint256)",
  "function getDepositStatus(uint256 tenderId, address bidder) external view returns (uint8)",
  "function requiredDeposit(uint256 tenderId) external view returns (uint256)",
  "function totalEscrow(uint256 tenderId) external view returns (uint256)",
  "function deposits(uint256 tenderId, address bidder) external view returns (uint256)",
  "function depositStatus(uint256 tenderId, address bidder) external view returns (uint8)",
  "event EscrowDeposited(uint256 indexed tenderId, address indexed bidder, uint256 amount)",
  "event EscrowReleased(uint256 indexed tenderId, address indexed bidder, uint256 amount)",
  "event EscrowRefunded(uint256 indexed tenderId, address indexed bidder, uint256 amount)",
  "event EscrowFrozen(uint256 indexed tenderId, address indexed bidder)",
  "event EscrowUnfrozen(uint256 indexed tenderId, address indexed bidder)",
  "event EscrowSlashed(uint256 indexed tenderId, address indexed bidder, address recipient, uint256 amount)",
  "event RequiredDepositSet(uint256 indexed tenderId, uint256 amount)",
];

export const REGISTRY_ABI = [
  "function registerBidder(address bidder) external",
  "function removeBidder(address bidder) external",
  "function addAuthorizedCaller(address caller) external",
  "function removeAuthorizedCaller(address caller) external",
  "function recordBid(address bidder) external",
  "function recordWin(address bidder) external",
  "function recordSlash(address bidder) external",
  "function recordCompletion(address bidder) external",
  "function isVerified(address bidder) external view returns (bool)",
  "function getProfile(address bidder) external view returns (tuple(bool verified, uint256 totalBids, uint256 totalWins, uint256 totalSlashes, uint256 completedOnTime, uint256 registeredAt))",
  "function getReputationScore(address bidder) external view returns (uint256)",
  "function bidderCount() external view returns (uint256)",
  "function allBidders(uint256 index) external view returns (address)",
  "function profiles(address bidder) external view returns (bool verified, uint256 totalBids, uint256 totalWins, uint256 totalSlashes, uint256 completedOnTime, uint256 registeredAt)",
  "event BidderRegistered(address indexed bidder)",
  "event BidderRemoved(address indexed bidder)",
  "event AuthorizedCallerAdded(address indexed caller)",
  "event AuthorizedCallerRemoved(address indexed caller)",
  "event BidRecorded(address indexed bidder)",
  "event WinRecorded(address indexed bidder)",
  "event SlashRecorded(address indexed bidder)",
  "event CompletionRecorded(address indexed bidder)",
];

export const DISPUTE_MANAGER_ABI = [
  "function fileCompanyComplaint(uint256 tenderId, address accused, string reason) external payable returns (uint256)",
  "function fileCitizenComplaint(uint256 tenderId, address accused, string reason) external returns (uint256)",
  "function executeCourtOrder(uint256 tenderId, address accused, string reason, bool shouldFreeze) external returns (uint256)",
  "function resolveDispute(uint256 disputeId, uint8 resolution) external",
  "function setCourtAuthority(address courtAuthority) external",
  "function getDispute(uint256 disputeId) external view returns (tuple(address complainant, address accused, uint256 tenderId, uint8 disputeType, uint8 status, uint256 stake, string reason))",
  "function getDisputesByTender(uint256 tenderId) external view returns (uint256[])",
  "function disputeCount() external view returns (uint256)",
  "function municipality() external view returns (address)",
  "function courtAuthority() external view returns (address)",
  "function COMPLAINT_STAKE() external view returns (uint256)",
  "event DisputeFiled(uint256 indexed disputeId, uint256 indexed tenderId, address complainant, address accused)",
  "event DisputeResolved(uint256 indexed disputeId, uint8 resolution)",
  "event StakeBurned(uint256 indexed disputeId, address complainant, address recipient, uint256 amount)",
];

export const ESCALATION_ABI = [
  "function setEscalationRule(uint256 tenderId, bytes32 materialId, uint256 baselinePrice, uint256 thresholdPercent, uint256 capPercent, uint256 periodSeconds) external",
  "function evaluateEscalation(uint256 tenderId, bytes32 materialId) external returns (uint256)",
  "function updateOraclePrice(bytes32 materialId, uint256 newPrice) external",
  "function setTenderPrice(uint256 tenderId, uint256 price) external",
  "function getBaselinePrice(uint256 tenderId, bytes32 materialId) external view returns (uint256)",
  "function getLatestPrice(bytes32 materialId) external view returns (uint256)",
  "function getTotalEscalation(uint256 tenderId) external view returns (uint256)",
  "function tenderPrice(uint256 tenderId) external view returns (uint256)",
  "function latestPrices(bytes32 materialId) external view returns (uint256)",
  "function totalEscalationPaid(uint256 tenderId) external view returns (uint256)",
  "function MAX_PRICE_CHANGE_BPS() external view returns (uint256)",
  "function BPS_DENOMINATOR() external view returns (uint256)",
  "event EscalationRuleSet(uint256 indexed tenderId, bytes32 materialId)",
  "event EscalationTriggered(uint256 indexed tenderId, bytes32 materialId, uint256 extraPayment)",
  "event OraclePriceUpdated(bytes32 indexed materialId, uint256 newPrice)",
];

export const COLLISION_DETECTOR_ABI = [
  "function checkCollision(uint256 tenderId, bytes[] encPrices) external",
  "function setCollisionResult(uint256 tenderId, bool result) external",
  "function collisionChecked(uint256 tenderId) external view returns (bool)",
  "function collisionDetected(uint256 tenderId) external view returns (bool)",
  "function collisionHandle(uint256 tenderId) external view returns (bytes32)",
  "event CollisionCheckStarted(uint256 indexed tenderId, uint256 bidCount)",
  "event CollisionCheckCompleted(uint256 indexed tenderId, bool hasCollision)",
];

export const CUSDC_ABI = [
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
];
