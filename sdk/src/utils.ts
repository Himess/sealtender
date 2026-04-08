/**
 * @module utils
 * @description Helper functions for parsing on-chain data,
 * encoding material IDs, and formatting token amounts.
 */

import { ethers } from "ethers";
import {
  TenderState,
  DisputeStatus,
  DisputeType,
  DepositStatus,
} from "./types";

// ─── Enum Parsers ───────────────────────────────────────────────────────────

/**
 * Parse a numeric state value into TenderState enum.
 * @param state - Numeric value from contract (0-5)
 * @returns Corresponding TenderState
 * @throws If state is out of valid range
 */
export function parseTenderState(state: number): TenderState {
  if (state < 0 || state > 5) {
    throw new Error(`Invalid TenderState: ${state}. Must be 0-5.`);
  }
  return state as TenderState;
}

/**
 * Parse a numeric status value into DisputeStatus enum.
 * @param status - Numeric value from contract (0-4)
 * @returns Corresponding DisputeStatus
 * @throws If status is out of valid range
 */
export function parseDisputeStatus(status: number): DisputeStatus {
  if (status < 0 || status > 4) {
    throw new Error(`Invalid DisputeStatus: ${status}. Must be 0-4.`);
  }
  return status as DisputeStatus;
}

/**
 * Parse a numeric type value into DisputeType enum.
 * @param type - Numeric value from contract (0-2)
 * @returns Corresponding DisputeType
 * @throws If type is out of valid range
 */
export function parseDisputeType(type: number): DisputeType {
  if (type < 0 || type > 2) {
    throw new Error(`Invalid DisputeType: ${type}. Must be 0-2.`);
  }
  return type as DisputeType;
}

/**
 * Parse a numeric status value into DepositStatus enum.
 * @param status - Numeric value from contract (0-5)
 * @returns Corresponding DepositStatus
 * @throws If status is out of valid range
 */
export function parseDepositStatus(status: number): DepositStatus {
  if (status < 0 || status > 5) {
    throw new Error(`Invalid DepositStatus: ${status}. Must be 0-5.`);
  }
  return status as DepositStatus;
}

// ─── Encoding Helpers ───────────────────────────────────────────────────────

/**
 * Encode a human-readable material ID string to bytes32.
 * @param id - Material ID string (e.g., "STEEL_REBAR")
 * @returns bytes32-encoded string
 * @throws If id exceeds 31 bytes
 */
export function materialIdToBytes32(id: string): string {
  return ethers.encodeBytes32String(id);
}

/**
 * Decode a bytes32 value back to a human-readable material ID string.
 * @param bytes32 - bytes32-encoded material ID
 * @returns Decoded string
 */
export function bytes32ToMaterialId(bytes32: string): string {
  return ethers.decodeBytes32String(bytes32);
}

// ─── Formatting ─────────────────────────────────────────────────────────────

/**
 * Format a USDC amount (6 decimals) to a human-readable string.
 * @param amount - Raw USDC amount (bigint, 6 decimal places)
 * @returns Formatted string (e.g., "1,250.50")
 */
export function formatUSDC(amount: bigint): string {
  const divisor = 1_000_000n;
  const whole = amount / divisor;
  const fraction = amount % divisor;

  const wholeStr = whole.toLocaleString("en-US");

  if (fraction === 0n) {
    return wholeStr;
  }

  // Pad fraction to 6 digits, then trim trailing zeros
  const fractionStr = fraction.toString().padStart(6, "0").replace(/0+$/, "");
  return `${wholeStr}.${fractionStr}`;
}

/**
 * Parse a human-readable USDC string to raw bigint amount (6 decimals).
 * @param usdc - Human-readable USDC amount (e.g., "1250.50")
 * @returns Raw bigint amount
 */
export function parseUSDC(usdc: string): bigint {
  const cleaned = usdc.replace(/,/g, "");
  const parts = cleaned.split(".");
  const whole = BigInt(parts[0]) * 1_000_000n;

  if (parts.length === 1) return whole;

  const fractionStr = parts[1].padEnd(6, "0").slice(0, 6);
  return whole + BigInt(fractionStr);
}

/**
 * Get a human-readable label for a TenderState.
 * @param state - TenderState enum value
 * @returns Human-readable state label
 */
export function tenderStateLabel(state: TenderState): string {
  const labels: Record<TenderState, string> = {
    [TenderState.Created]: "Created",
    [TenderState.Bidding]: "Bidding",
    [TenderState.Evaluating]: "Evaluating",
    [TenderState.Revealed]: "Revealed",
    [TenderState.Completed]: "Completed",
    [TenderState.Cancelled]: "Cancelled",
  };
  return labels[state] ?? "Unknown";
}

/**
 * Get a human-readable label for a DepositStatus.
 * @param status - DepositStatus enum value
 * @returns Human-readable status label
 */
export function depositStatusLabel(status: DepositStatus): string {
  const labels: Record<DepositStatus, string> = {
    [DepositStatus.None]: "None",
    [DepositStatus.Active]: "Active",
    [DepositStatus.Frozen]: "Frozen",
    [DepositStatus.Released]: "Released",
    [DepositStatus.Refunded]: "Refunded",
    [DepositStatus.Slashed]: "Slashed",
  };
  return labels[status] ?? "Unknown";
}
