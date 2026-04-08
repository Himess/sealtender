/**
 * @module types
 * @description TypeScript types and enums mirroring SealTender Solidity contracts.
 *
 * All enums map 1:1 to their Solidity counterparts in ISealTender.sol.
 * All interfaces mirror the on-chain struct layouts.
 */

// ─── Enums ──────────────────────────────────────────────────────────────────

/**
 * Lifecycle state of a tender instance.
 * Maps to ISealTender.TenderState in Solidity.
 */
export enum TenderState {
  /** Contract deployed but not yet active */
  Created = 0,
  /** Accepting encrypted bids */
  Bidding = 1,
  /** Bid evaluation in progress (FHE scoring) */
  Evaluating = 2,
  /** Evaluation complete, winner determined */
  Revealed = 3,
  /** Winner confirmed, escrow released */
  Completed = 4,
  /** Tender cancelled by owner */
  Cancelled = 5,
}

/**
 * Type of dispute filed against a bidder.
 * Maps to ISealTender.DisputeType in Solidity.
 */
export enum DisputeType {
  /** Filed by a competing company (requires stake) */
  Company = 0,
  /** Filed by a citizen (no stake required) */
  Citizen = 1,
  /** Issued by a court authority */
  CourtOrder = 2,
}

/**
 * Resolution status of a dispute.
 * Maps to ISealTender.DisputeStatus in Solidity.
 */
export enum DisputeStatus {
  /** Newly filed, awaiting review */
  Open = 0,
  /** Under active investigation */
  Investigating = 1,
  /** Accused found guilty, escrow slashed */
  Slashed = 2,
  /** Escrow frozen pending investigation */
  Frozen = 3,
  /** Dispute dismissed, complainant stake burned to municipality */
  Dismissed = 4,
}

/**
 * Status of an escrow deposit.
 * Maps to ISealTender.DepositStatus in Solidity.
 */
export enum DepositStatus {
  /** No deposit made */
  None = 0,
  /** Deposit active and held */
  Active = 1,
  /** Deposit frozen by dispute */
  Frozen = 2,
  /** Deposit released to winner */
  Released = 3,
  /** Deposit refunded to bidder */
  Refunded = 4,
  /** Deposit slashed to municipality */
  Slashed = 5,
}

// ─── Interfaces ─────────────────────────────────────────────────────────────

/**
 * Configuration for creating a new tender.
 * Maps to ISealTender.TenderConfig struct (11 fields).
 */
export interface TenderConfig {
  /** Human-readable description of the procurement */
  description: string;
  /** Unix timestamp after which no bids are accepted */
  deadline: bigint;
  /** Weight for years of experience in scoring (basis points) */
  weightYears: number;
  /** Weight for completed projects in scoring (basis points) */
  weightProjects: number;
  /** Weight for bond capacity in scoring (basis points) */
  weightBond: number;
  /** Minimum years of experience required to bid */
  minYears: number;
  /** Minimum completed projects required to bid */
  minProjects: number;
  /** Minimum bond capacity required to bid (in USDC units) */
  minBond: bigint;
  /** Required escrow deposit amount (in wei) */
  escrowAmount: bigint;
  /** Maximum number of bidders (1-10, FHE HCU limit) */
  maxBidders: bigint;
  /** Minimum reputation score required (0-100) */
  minReputation: bigint;
}

/**
 * Input data for submitting an encrypted bid.
 * These values are encrypted client-side before submission.
 */
export interface BidInput {
  /** Bid price in USDC (6 decimals) */
  price: bigint;
  /** Years of experience */
  yearsExperience: number;
  /** Number of completed projects */
  completedProjects: number;
  /** Bond capacity in USDC (6 decimals) */
  bondCapacity: bigint;
}

/**
 * Decrypted bid data after reveal.
 * Only the winning bid is decrypted.
 */
export interface DecryptedBid {
  /** Winning bid price */
  price: bigint;
  /** Winner's years of experience */
  years: number;
  /** Winner's completed project count */
  projects: number;
  /** Winner's bond capacity */
  bond: bigint;
}

/**
 * On-chain bidder profile from BidderRegistry.
 * Tracks verification status and reputation metrics.
 */
export interface BidderProfile {
  /** Whether the bidder has been KYC-verified */
  verified: boolean;
  /** Total number of bids placed across all tenders */
  totalBids: bigint;
  /** Total number of tenders won */
  totalWins: bigint;
  /** Total number of times slashed */
  totalSlashes: bigint;
  /** Number of projects completed on time */
  completedOnTime: bigint;
  /** Block timestamp when bidder was registered */
  registeredAt: bigint;
}

/**
 * Dispute record from DisputeManager.
 */
export interface Dispute {
  /** Address that filed the complaint */
  complainant: string;
  /** Address being accused */
  accused: string;
  /** Associated tender ID */
  tenderId: bigint;
  /** Type of dispute */
  disputeType: DisputeType;
  /** Current resolution status */
  status: DisputeStatus;
  /** Stake amount (ETH, only for Company disputes) */
  stake: bigint;
  /** Human-readable reason for the dispute */
  reason: string;
}

/**
 * Price escalation rule for a material in a tender.
 */
export interface EscalationRule {
  /** Material identifier (bytes32) */
  materialId: string;
  /** Baseline price at contract time */
  baselinePrice: bigint;
  /** Percentage increase threshold to trigger escalation (basis points) */
  thresholdPercent: bigint;
  /** Maximum allowed escalation percentage (basis points) */
  capPercent: bigint;
  /** Minimum time between evaluations (seconds) */
  periodSeconds: bigint;
  /** Last time escalation was evaluated */
  lastEvaluated: bigint;
}

/**
 * Addresses of all deployed SealTender contracts.
 */
export interface ContractAddresses {
  /** TenderFactory address */
  factory: string;
  /** BidEscrow address */
  escrow: string;
  /** BidderRegistry address */
  registry: string;
  /** DisputeManager address */
  disputeManager: string;
  /** PriceEscalation address */
  escalation: string;
  /** CollisionDetector address */
  collisionDetector: string;
  /** ConfidentialUSDC / MockUSDC address */
  cusdc: string;
}

/**
 * Result of creating a new tender via the factory.
 */
export interface CreateTenderResult {
  /** Assigned tender ID */
  tenderId: bigint;
  /** Deployed EncryptedTender contract address */
  tenderAddress: string;
}

/**
 * Result of revealing the tender winner.
 */
export interface RevealResult {
  /** Winner's Ethereum address */
  winnerAddress: string;
  /** Winning bid price */
  winnerPrice: bigint;
}

/**
 * Escrow deposit information for a bidder.
 */
export interface EscrowInfo {
  /** Deposited amount in wei */
  amount: bigint;
  /** Current deposit status */
  status: DepositStatus;
}
