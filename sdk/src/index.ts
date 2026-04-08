/**
 * @sealtender/sdk
 *
 * TypeScript SDK for the SealTender FHE-encrypted procurement protocol.
 * Provides a high-level client for interacting with all protocol contracts
 * including FHE bid encryption, tender lifecycle, escrow, disputes, and registry.
 *
 * @example
 * ```typescript
 * import { SealTenderClient, TenderState, BidInput } from "@sealtender/sdk";
 * ```
 */

// ─── Types & Enums ──────────────────────────────────────────────────────────
export {
  TenderState,
  DisputeType,
  DisputeStatus,
  DepositStatus,
  type TenderConfig,
  type BidInput,
  type DecryptedBid,
  type BidderProfile,
  type Dispute,
  type EscalationRule,
  type ContractAddresses,
  type CreateTenderResult,
  type RevealResult,
  type EscrowInfo,
} from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────
export {
  SEPOLIA_CHAIN_ID,
  KMS_CONTRACT_ADDRESS,
  ACL_CONTRACT_ADDRESS,
  GATEWAY_URL,
  DEFAULT_ADDRESSES,
  FACTORY_ABI,
  TENDER_ABI,
  ESCROW_ABI,
  REGISTRY_ABI,
  DISPUTE_MANAGER_ABI,
  ESCALATION_ABI,
  COLLISION_DETECTOR_ABI,
  CUSDC_ABI,
} from "./constants";

// ─── Utilities ──────────────────────────────────────────────────────────────
export {
  parseTenderState,
  parseDisputeStatus,
  parseDisputeType,
  parseDepositStatus,
  materialIdToBytes32,
  bytes32ToMaterialId,
  formatUSDC,
  parseUSDC,
  tenderStateLabel,
  depositStatusLabel,
} from "./utils";

// ─── Errors ─────────────────────────────────────────────────────────────────
export {
  SealTenderError,
  FHEEncryptionError,
  ContractCallError,
  TransactionError,
  ValidationError,
  WalletNotConnectedError,
} from "./errors";

// ─── Client ─────────────────────────────────────────────────────────────────
export { SealTenderClient } from "./SealTenderClient";
