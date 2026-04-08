// ============================================================================
// SealTender Contract Addresses, ABIs, Types
// ============================================================================

export const ADDRESSES = {
  BidderRegistry: "0x38122E455f967B5EE8FDF0bCA3EB4A7d9AD51711" as const,
  BidEscrow: "0x616f81F048192790f423Ba9357D0645E37EdE57b" as const,
  ConfidentialUSDC:
    "0xf80777AB1F957c191dA452043214cB379B46acB5" as const,
  TenderFactory: "0x6f18ea47A650C4326Dc948d9A4200C6813C5dF94" as const,
  DisputeManager:
    "0x988eA196701550C38AD0667403B2be79a4078E68" as const,
  PriceEscalation:
    "0x3a306d63100E0e5b428404eDf00295b004eaF949" as const,
  CollisionDetector:
    "0xDF90Bb1930f06410a64502959a00971fB84F4CB4" as const,
} as const;

// ============================================================================
// ABIs
// ============================================================================

export const TenderFactoryABI = [
  "function createTender(string description, uint256 deadline, uint8 maxBidders) external returns (address)",
  "function getTender(uint256 index) external view returns (address)",
  "function tenderCount() external view returns (uint256)",
  "function getAllTenders() external view returns (address[])",
  "function owner() external view returns (address)",
] as const;

export const EncryptedTenderABI = [
  "function getConfig() external view returns (string description, uint256 deadline, uint8 maxBidders, address creator)",
  "function currentState() external view returns (uint8)",
  "function bidderCount() external view returns (uint256)",
  "function hasBid(address bidder) external view returns (bool)",
  "function submitBid(bytes32 inputProof, bytes calldata encryptedData) external payable",
  "function closeBidding() external",
  "function revealWinner() external",
  "function winner() external view returns (address)",
  "function revealedPrice() external view returns (uint256)",
  "function getAllBidders() external view returns (address[])",
  "function creator() external view returns (address)",
  "function description() external view returns (string)",
  "function deadline() external view returns (uint256)",
  "function maxBidders() external view returns (uint8)",
  "function getBidDeposit(address bidder) external view returns (uint256)",
  "function totalDeposits() external view returns (uint256)",
] as const;

export const BidEscrowABI = [
  "function deposit(uint256 tenderId) external payable",
  "function withdraw(uint256 tenderId) external",
  "function getDeposit(uint256 tenderId, address bidder) external view returns (uint256)",
  "function getTotalEscrow(uint256 tenderId) external view returns (uint256)",
  "function getDepositStatus(uint256 tenderId, address bidder) external view returns (uint8)",
  "function owner() external view returns (address)",
] as const;

export const BidderRegistryABI = [
  "function registerBidder(address bidder, string calldata name, string calldata registrationId) external",
  "function removeBidder(address bidder) external",
  "function isRegistered(address bidder) external view returns (bool)",
  "function getProfile(address bidder) external view returns (string name, string registrationId, uint256 registeredAt, bool active)",
  "function getReputationScore(address bidder) external view returns (uint256)",
  "function updateReputation(address bidder, uint256 score) external",
  "function bidderCount() external view returns (uint256)",
  "function allBidders(uint256 index) external view returns (address)",
  "function owner() external view returns (address)",
] as const;

export const DisputeManagerABI = [
  "function fileCompanyComplaint(uint256 tenderId, address accused, string calldata reason) external payable",
  "function fileCitizenComplaint(uint256 tenderId, address accused, string calldata reason) external",
  "function resolveDispute(uint256 disputeId, bool upheld) external",
  "function getDispute(uint256 disputeId) external view returns (uint8 disputeType, uint256 tenderId, address complainant, address accused, string reason, uint8 status, uint256 filedAt)",
  "function disputeCount() external view returns (uint256)",
  "function companyComplaintFee() external view returns (uint256)",
  "function owner() external view returns (address)",
] as const;

export const PriceEscalationABI = [
  "function trackMaterial(uint256 tenderId, string calldata materialName, uint256 baselinePrice) external",
  "function updatePrice(uint256 tenderId, string calldata materialName, uint256 newPrice) external",
  "function evaluateEscalation(uint256 tenderId) external",
  "function getBaselinePrice(uint256 tenderId, string calldata materialName) external view returns (uint256)",
  "function getLatestPrice(uint256 tenderId, string calldata materialName) external view returns (uint256)",
  "function totalEscalationPaid(uint256 tenderId) external view returns (uint256)",
  "function tenderPrice(uint256 tenderId) external view returns (uint256)",
  "function setTenderPrice(uint256 tenderId, uint256 price) external",
  "function escalationThreshold() external view returns (uint256)",
  "function owner() external view returns (address)",
] as const;

export const ConfidentialUSDCABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function mint(address to, uint256 amount) external",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
] as const;

export const CollisionDetectorABI = [
  "function checkCollision(uint256 tenderId, bytes32 bidHash) external view returns (bool)",
  "function registerBidHash(uint256 tenderId, bytes32 bidHash) external",
  "function getCollisionCount(uint256 tenderId) external view returns (uint256)",
  "function owner() external view returns (address)",
] as const;

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface TenderConfig {
  description: string;
  deadline: bigint;
  maxBidders: number;
  creator: `0x${string}`;
}

export interface BidderProfile {
  name: string;
  registrationId: string;
  registeredAt: bigint;
  active: boolean;
}

export interface Dispute {
  disputeType: DisputeType;
  tenderId: bigint;
  complainant: `0x${string}`;
  accused: `0x${string}`;
  reason: string;
  status: DisputeStatus;
  filedAt: bigint;
}

export interface EscalationRule {
  tenderId: bigint;
  materialName: string;
  baselinePrice: bigint;
  latestPrice: bigint;
}

// ============================================================================
// Enums
// ============================================================================

export enum TenderState {
  CREATED = 0,
  BIDDING = 1,
  CLOSED = 2,
  EVALUATING = 3,
  REVEALED = 4,
  CANCELLED = 5,
}

export enum DisputeType {
  COMPANY = 0,
  CITIZEN = 1,
}

export enum DisputeStatus {
  PENDING = 0,
  RESOLVED = 1,
  REJECTED = 2,
}

export enum DepositStatus {
  NONE = 0,
  DEPOSITED = 1,
  WITHDRAWN = 2,
  FORFEITED = 3,
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
