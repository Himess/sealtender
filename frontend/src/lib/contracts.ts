// ============================================================================
// SealTender Contract Addresses, ABIs, Types
// ============================================================================

// Sepolia v3 deployment (B-L6 + B-M5 + frontend audit fix-up, April 2026).
// Sourcify-verified at https://repo.sourcify.dev/contracts/full_match/11155111/<address>/
//
// What changed vs v2:
//   • BidEscrow — adds claimRefund(tenderId), tenderOf mapping, setTenderAddress
//   • PriceEscalation — adds tenderManager + authorizedTenders, broader
//     setTenderWinner auth so winnerSink auto-forwards from EncryptedTender
//   • TenderFactory — wires new BidEscrow.setTenderAddress + escalation auth
//   • DisputeManager — redeployed against new BidEscrow address
export const ADDRESSES = {
  BidderRegistry: "0x2E8037626102ca3393ab9EfE7a3A254b30B236CA" as const,
  BidEscrow: "0x76FBC67992459E972b80A88e11a5c15B0CFDBD11" as const,
  ConfidentialUSDC: "0xCe493fFaBf3763df8057E58c22a6dC6a65806553" as const,
  PriceEscalation: "0x1CE25ee2D44aDCa3127AD3b3B9e0B6CBd598C012" as const,
  CollisionDetector: "0x3e8c0eDC536bce66ba8ef161eC40E7fA39d38Aee" as const,
  TenderFactory: "0x617C5414f0b9e2a2c7850d81068FC50138b5c96f" as const,
  DisputeManager: "0xEae392E045518CF78FF279Bf4129b9073eB3A5bb" as const,
} as const;

/// External integrations bound at deploy time
export const EXTERNAL_ADDRESSES = {
  USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const, // Circle USDC on Sepolia
  Pyth: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21" as const, // Pyth oracle on Sepolia
} as const;

// ============================================================================
// ABIs
// ============================================================================

export const TenderFactoryABI = [
  // --- Read ---
  "function tenderCount() external view returns (uint256)",
  "function tenders(uint256 id) external view returns (address)",
  "function getTender(uint256 id) external view returns (address)",
  "function getAllTenders() external view returns (address[])",
  "function getTenders(uint256 offset, uint256 limit) external view returns (address[])",
  "function getTenderConfig(uint256 id) external view returns ((string description, uint256 deadline, uint32 weightYears, uint32 weightProjects, uint32 weightBond, uint32 minYears, uint32 minProjects, uint64 minBond, uint256 escrowAmount, uint256 maxBidders, uint256 minReputation))",
  "function getTenderSpec(uint256 id) external view returns ((string category, uint256 totalAreaM2, uint256 estimatedValueMin, uint256 estimatedValueMax, string boqReference, string standardsReference, uint256 completionDays, uint256 liquidatedDamages))",
  "function registry() external view returns (address)",
  "function escrow() external view returns (address)",
  "function disputeManager() external view returns (address)",
  "function escalation() external view returns (address)",
  "function collisionDetector() external view returns (address)",
  "function owner() external view returns (address)",
  // --- Owner write ---
  "function createTender((string description, uint256 deadline, uint32 weightYears, uint32 weightProjects, uint32 weightBond, uint32 minYears, uint32 minProjects, uint64 minBond, uint256 escrowAmount, uint256 maxBidders, uint256 minReputation) config, (string category, uint256 totalAreaM2, uint256 estimatedValueMin, uint256 estimatedValueMax, string boqReference, string standardsReference, uint256 completionDays, uint256 liquidatedDamages) spec) external returns (uint256 tenderId, address tenderAddress)",
  "function setDisputeManager(address _dm) external",
  "function setEscalation(address _esc) external",
  "function setCollisionDetector(address _cd) external",
  // --- Events ---
  "event TenderCreated(uint256 indexed tenderId, address tenderContract, string description)",
] as const;

export const EncryptedTenderABI = [
  // --- Read ---
  "function tenderId() external view returns (uint256)",
  "function state() external view returns (uint8)",
  "function getConfig() external view returns ((string description, uint256 deadline, uint32 weightYears, uint32 weightProjects, uint32 weightBond, uint32 minYears, uint32 minProjects, uint64 minBond, uint256 escrowAmount, uint256 maxBidders, uint256 minReputation))",
  "function getSpec() external view returns ((string category, uint256 totalAreaM2, uint256 estimatedValueMin, uint256 estimatedValueMax, string boqReference, string standardsReference, uint256 completionDays, uint256 liquidatedDamages))",
  "function bidders(uint256 idx) external view returns (address)",
  "function getBidders(uint256 offset, uint256 limit) external view returns (address[])",
  "function hasBid(address bidder) external view returns (bool)",
  "function evaluatedCount() external view returns (uint256)",
  "function evaluationComplete() external view returns (bool)",
  "function winnerAddress() external view returns (address)",
  "function revealedPrice() external view returns (uint256)",
  "function revealed() external view returns (bool)",
  "function winnerIdxHandle() external view returns (bytes32)",
  "function winnerPriceHandle() external view returns (bytes32)",
  "function winnerSink() external view returns (address)",
  "function revealRequestedAt() external view returns (uint256)",
  "function revealTimeout() external view returns (uint256)",
  "function MAX_BIDDERS() external view returns (uint256)",
  "function MAX_BATCH_SIZE() external view returns (uint256)",
  "function paused() external view returns (bool)",
  "function owner() external view returns (address)",
  // --- User-facing write ---
  "function submitBid(bytes32 _encPrice, bytes _priceProof, bytes32 _encYears, bytes _yearsProof, bytes32 _encProjects, bytes _projectsProof, bytes32 _encBond, bytes _bondProof) external",
  // --- Owner write ---
  "function evaluateBatch(uint256 startIdx, uint256 endIdx) external",
  "function requestReveal() external",
  "function revealWinner(uint256 winnerIdx, uint256 price, bytes decryptionProof) external",
  "function setWinnerSink(address _sink) external",
  "function setRevealTimeout(uint256 _seconds) external",
  "function cancelTender() external",
  "function pause() external",
  "function unpause() external",
  // --- Permissionless liveness escape hatch ---
  "function forceCancelStuckReveal() external",
  // --- Events ---
  "event BidSubmitted(address indexed bidder, uint256 timestamp)",
  "event BidUpdated(address indexed bidder, uint256 version)",
  "event EvaluationBatchCompleted(uint256 startIdx, uint256 endIdx)",
  "event EvaluationCompleted(uint256 totalBidders)",
  "event RevealRequested(bytes32 idxHandle, bytes32 priceHandle)",
  "event WinnerRevealed(address winner, uint256 price)",
  "event TenderCancelled(uint256 timestamp)",
  "event StuckRevealForceCancelled(address indexed by, uint256 elapsed)",
] as const;

export const BidEscrowABI = [
  // --- Read ---
  "function requiredDeposit(uint256 tenderId) external view returns (uint256)",
  "function deposits(uint256 tenderId, address bidder) external view returns (uint256)",
  "function totalEscrow(uint256 tenderId) external view returns (uint256)",
  "function depositStatus(uint256 tenderId, address bidder) external view returns (uint8)",
  "function getDeposit(uint256 tenderId, address bidder) external view returns (uint256)",
  "function getDepositStatus(uint256 tenderId, address bidder) external view returns (uint8)",
  "function authorizedCallers(address) external view returns (bool)",
  "function owner() external view returns (address)",
  "function tenderOf(uint256 tenderId) external view returns (address)",
  // --- User write ---
  "function deposit(uint256 tenderId) external payable",
  "function claimRefund(uint256 tenderId) external",
  // --- Authorized write (Vault / DisputeManager / Factory) ---
  "function release(uint256 tenderId, address bidder) external",
  "function refund(uint256 tenderId, address bidder) external",
  "function freeze(uint256 tenderId, address bidder) external",
  "function unfreeze(uint256 tenderId, address bidder) external",
  "function slash(uint256 tenderId, address bidder, address recipient) external",
  "function setRequiredDeposit(uint256 tenderId, uint256 amount) external",
  // --- Owner write ---
  "function authorizeCaller(address caller) external",
  "function deauthorizeCaller(address caller) external",
  // --- Events ---
  "event EscrowDeposited(uint256 indexed tenderId, address indexed bidder, uint256 amount)",
  "event EscrowReleased(uint256 indexed tenderId, address indexed bidder, uint256 amount)",
  "event EscrowRefunded(uint256 indexed tenderId, address indexed bidder, uint256 amount)",
  "event EscrowSlashed(uint256 indexed tenderId, address indexed bidder, address recipient, uint256 amount)",
] as const;

export const BidderRegistryABI = [
  // --- Read ---
  "function profiles(address bidder) external view returns (bool verified, uint256 totalBids, uint256 totalWins, uint256 totalSlashes, uint256 completedOnTime, uint256 registeredAt)",
  "function isVerified(address bidder) external view returns (bool)",
  "function getProfile(address bidder) external view returns ((bool verified, uint256 totalBids, uint256 totalWins, uint256 totalSlashes, uint256 completedOnTime, uint256 registeredAt))",
  "function getReputationScore(address bidder) external view returns (uint256)",
  "function bidderCount() external view returns (uint256)",
  "function allBidders(uint256 index) external view returns (address)",
  "function authorizedCallers(address) external view returns (bool)",
  "function tenderManager() external view returns (address)",
  "function owner() external view returns (address)",
  // --- Owner write ---
  "function registerBidder(address bidder) external",
  "function removeBidder(address bidder) external",
  "function setTenderManager(address _tenderManager) external",
  "function removeAuthorizedCaller(address caller) external",
  // --- Owner OR tenderManager write ---
  "function addAuthorizedCaller(address caller) external",
  // --- Events ---
  "event BidderRegistered(address indexed bidder)",
  "event BidderRemoved(address indexed bidder)",
  "event TenderManagerSet(address indexed manager)",
] as const;

export const DisputeManagerABI = [
  // --- Read ---
  "function disputeCount() external view returns (uint256)",
  "function disputes(uint256 disputeId) external view returns (address complainant, address accused, uint256 tenderId, uint8 disputeType, uint8 status, uint256 stake, string reason)",
  "function disputeCreatedAt(uint256 disputeId) external view returns (uint256)",
  "function CITIZEN_STAKE() external view returns (uint256)",
  "function COMPLAINT_STAKE_BPS() external view returns (uint256)",
  "function getDispute(uint256 disputeId) external view returns ((address complainant, address accused, uint256 tenderId, uint8 disputeType, uint8 status, uint256 stake, string reason))",
  "function getDisputesByTender(uint256 tenderId) external view returns (uint256[])",
  "function getComplaintStake(uint256 tenderId) external view returns (uint256)",
  "function CITIZEN_STAKE() external view returns (uint256)",
  "function COMPLAINT_STAKE_BPS() external view returns (uint256)",
  "function DISPUTE_TIMEOUT() external view returns (uint256)",
  "function owner() external view returns (address)",
  "function courtAuthority() external view returns (address)",
  // --- User write (payable, requires stake) ---
  "function fileCompanyComplaint(uint256 tenderId, address accused, string reason) external payable returns (uint256)",
  "function fileCitizenComplaint(uint256 tenderId, address accused, string reason) external payable returns (uint256)",
  // --- Court write ---
  "function executeCourtOrder(uint256 tenderId, address accused, string reason, bool shouldFreeze) external returns (uint256)",
  // --- Permissionless ---
  "function timeoutDispute(uint256 disputeId) external",
  // --- Owner write ---
  "function resolveDispute(uint256 disputeId, uint8 resolution) external",
  "function setCourtAuthority(address _courtAuthority) external",
  // --- Events ---
  "event DisputeFiled(uint256 indexed disputeId, uint256 indexed tenderId, address complainant, address accused)",
  "event DisputeResolved(uint256 indexed disputeId, uint8 resolution)",
  "event StakeBurned(uint256 indexed disputeId, address complainant, address recipient, uint256 amount)",
] as const;

export const PriceEscalationABI = [
  // --- Read ---
  "function rules(uint256 tenderId, bytes32 materialId) external view returns (bytes32 materialId_, uint256 baselinePrice, uint256 thresholdPercent, uint256 capPercent, uint256 periodSeconds, uint256 lastEvaluated)",
  "function totalEscalationPaid(uint256 tenderId) external view returns (uint256)",
  "function tenderPrice(uint256 tenderId) external view returns (uint256)",
  "function tenderWinner(uint256 tenderId) external view returns (address)",
  "function escalationBudget(uint256 tenderId) external view returns (uint256)",
  "function priceFeeds(bytes32 materialId) external view returns (address)",
  "function pythFeedIds(bytes32 materialId) external view returns (bytes32)",
  "function pyth() external view returns (address)",
  "function getLatestPrice(bytes32 materialId) external view returns (uint256)",
  "function getBaselinePrice(uint256 tenderId, bytes32 materialId) external view returns (uint256)",
  "function getTotalEscalation(uint256 tenderId) external view returns (uint256)",
  "function MAX_PRICE_CHANGE_BPS() external view returns (uint256)",
  "function ORACLE_PRECISION() external view returns (uint256)",
  "function PYTH_MAX_AGE() external view returns (uint256)",
  "function owner() external view returns (address)",
  // --- Public write (budget deposit) ---
  "function depositEscalationBudget(uint256 tenderId) external payable",
  // --- Owner write ---
  "function setTenderPrice(uint256 tenderId, uint256 price) external",
  "function setTenderWinner(uint256 tenderId, address winner) external",
  "function setPriceFeed(bytes32 materialId, address feed) external",
  "function setPyth(address _pyth) external",
  "function setPythFeed(bytes32 materialId, bytes32 feedId) external",
  "function setEscalationRule(uint256 tenderId, bytes32 materialId, uint256 baselinePrice, uint256 thresholdPercent, uint256 capPercent, uint256 periodSeconds) external",
  "function updateOraclePrice(bytes32 materialId, uint256 newPrice) external",
  "function evaluateEscalation(uint256 tenderId, bytes32 materialId) external returns (uint256)",
  // --- Events ---
  "event EscalationRuleSet(uint256 indexed tenderId, bytes32 materialId)",
  "event EscalationTriggered(uint256 indexed tenderId, bytes32 materialId, uint256 extraPayment)",
  "event EscalationPayment(uint256 indexed tenderId, address indexed winner, uint256 amount)",
] as const;

// ConfidentialUSDC inherits OZ ERC7984ERC20Wrapper. Balances are encrypted
// (euint64 handles); use the Zama Relayer / fhevmjs to decrypt your own balance.
// The plaintext-amount entry points are wrap and finalizeUnwrap; unwrap takes
// an encrypted amount and queues a request that's settled by KMS-signed proof.
export const ConfidentialUSDCABI = [
  // --- Read ---
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function rate() external view returns (uint256)",
  "function underlying() external view returns (address)",
  "function inferredTotalSupply() external view returns (uint256)",
  "function maxTotalSupply() external view returns (uint256)",
  "function paused() external view returns (bool)",
  "function owner() external view returns (address)",
  "function unwrapRequester(bytes32 unwrapRequestId) external view returns (address)",
  "function isOperator(address holder, address spender) external view returns (bool)",
  "function balanceOf(address account) external view returns (bytes32)", // returns euint64 handle
  // --- User write ---
  "function wrap(address to, uint256 amount) external returns (bytes32)",
  "function unwrap(address from, address to, bytes32 amount) external returns (bytes32)",
  "function unwrap(address from, address to, bytes32 encryptedAmount, bytes inputProof) external returns (bytes32)",
  "function finalizeUnwrap(bytes32 unwrapRequestId, uint64 unwrapAmountCleartext, bytes decryptionProof) external",
  "function setOperator(address spender, uint48 until) external",
  "function transfer(address to, bytes32 amount) external returns (bytes32)",
  "function transferFrom(address from, address to, bytes32 amount) external returns (bytes32)",
  // --- Owner write ---
  "function pause() external",
  "function unpause() external",
  // --- Events ---
  "event UnwrapRequested(address indexed to, bytes32 indexed unwrapRequestId, bytes32 amount)",
  "event UnwrapFinalized(address indexed to, bytes32 indexed unwrapRequestId, bytes32 amount, uint64 amountCleartext)",
] as const;

// CollisionDetector uses FHE pairwise equality (O(n^2)) over up to 10 bids and
// produces a single ebool whose decryption is gated by KMS signatures.
export const CollisionDetectorABI = [
  // --- Read ---
  "function collisionChecked(uint256 tenderId) external view returns (bool)",
  "function collisionDetected(uint256 tenderId) external view returns (bool)",
  "function collisionHandle(uint256 tenderId) external view returns (bytes32)",
  "function isCollisionDetected(uint256 tenderId) external view returns (bool checked, bool detected)",
  "function owner() external view returns (address)",
  // --- Owner write ---
  "function checkCollision(uint256 tenderId, bytes32[] encPrices, bytes[] proofs) external",
  "function setCollisionResult(uint256 tenderId, bool result, bytes decryptionProof) external",
  // --- Events ---
  "event CollisionCheckStarted(uint256 indexed tenderId, uint256 bidCount)",
  "event CollisionCheckCompleted(uint256 indexed tenderId, bool hasCollision)",
] as const;

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface TenderConfig {
  description: string;
  deadline: bigint;
  weightYears: number;
  weightProjects: number;
  weightBond: number;
  minYears: number;
  minProjects: number;
  minBond: bigint;
  escrowAmount: bigint;
  maxBidders: bigint;
  minReputation: bigint;
}

export interface TenderSpecification {
  category: string;
  totalAreaM2: bigint;
  estimatedValueMin: bigint;
  estimatedValueMax: bigint;
  boqReference: string;
  standardsReference: string;
  completionDays: bigint;
  liquidatedDamages: bigint;
}

export interface BidderProfile {
  verified: boolean;
  totalBids: bigint;
  totalWins: bigint;
  totalSlashes: bigint;
  completedOnTime: bigint;
  registeredAt: bigint;
}

export interface Dispute {
  complainant: `0x${string}`;
  accused: `0x${string}`;
  tenderId: bigint;
  disputeType: DisputeType;
  status: DisputeStatus;
  stake: bigint;
  reason: string;
}

export interface EscalationRule {
  materialId: `0x${string}`;
  baselinePrice: bigint;
  thresholdPercent: bigint;
  capPercent: bigint;
  periodSeconds: bigint;
  lastEvaluated: bigint;
}

// ============================================================================
// Enums
// ============================================================================

// Mirrors `enum TenderState` in contracts/interfaces/ISealTender.sol
export enum TenderState {
  Created = 0,
  Bidding = 1,
  Evaluating = 2,
  Revealed = 3,
  Completed = 4,
  Cancelled = 5,
}

export enum DisputeType {
  Company = 0,
  Citizen = 1,
  CourtOrder = 2,
}

export enum DisputeStatus {
  Open = 0,
  Investigating = 1,
  Slashed = 2,
  Frozen = 3,
  Dismissed = 4,
}

export enum DepositStatus {
  None = 0,
  Active = 1,
  Frozen = 2,
  Released = 3,
  Refunded = 4,
  Slashed = 5,
}

// ============================================================================
// Contract Map
// ============================================================================

const contracts = {
  TenderFactory: {
    address: ADDRESSES.TenderFactory,
    abi: TenderFactoryABI,
  },
  BidEscrow: {
    address: ADDRESSES.BidEscrow,
    abi: BidEscrowABI,
  },
  BidderRegistry: {
    address: ADDRESSES.BidderRegistry,
    abi: BidderRegistryABI,
  },
  DisputeManager: {
    address: ADDRESSES.DisputeManager,
    abi: DisputeManagerABI,
  },
  PriceEscalation: {
    address: ADDRESSES.PriceEscalation,
    abi: PriceEscalationABI,
  },
  ConfidentialUSDC: {
    address: ADDRESSES.ConfidentialUSDC,
    abi: ConfidentialUSDCABI,
  },
  CollisionDetector: {
    address: ADDRESSES.CollisionDetector,
    abi: CollisionDetectorABI,
  },
} as const;

export default contracts;
