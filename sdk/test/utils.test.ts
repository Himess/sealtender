import { describe, it, expect } from "vitest";
import {
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
} from "../src/utils";
import { TenderState, DisputeStatus, DisputeType, DepositStatus } from "../src/types";

// ─── parseTenderState ──────────────────────────────────────────────────────

describe("parseTenderState", () => {
  it("parses all valid states 0-5", () => {
    expect(parseTenderState(0)).toBe(TenderState.Created);
    expect(parseTenderState(1)).toBe(TenderState.Bidding);
    expect(parseTenderState(2)).toBe(TenderState.Evaluating);
    expect(parseTenderState(3)).toBe(TenderState.Revealed);
    expect(parseTenderState(4)).toBe(TenderState.Completed);
    expect(parseTenderState(5)).toBe(TenderState.Cancelled);
  });

  it("throws for negative values", () => {
    expect(() => parseTenderState(-1)).toThrow("Invalid TenderState");
  });

  it("throws for values above 5", () => {
    expect(() => parseTenderState(6)).toThrow("Invalid TenderState");
    expect(() => parseTenderState(100)).toThrow("Must be 0-5");
  });
});

// ─── parseDisputeStatus ────────────────────────────────────────────────────

describe("parseDisputeStatus", () => {
  it("parses all valid statuses 0-4", () => {
    expect(parseDisputeStatus(0)).toBe(DisputeStatus.Open);
    expect(parseDisputeStatus(1)).toBe(DisputeStatus.Investigating);
    expect(parseDisputeStatus(2)).toBe(DisputeStatus.Slashed);
    expect(parseDisputeStatus(3)).toBe(DisputeStatus.Frozen);
    expect(parseDisputeStatus(4)).toBe(DisputeStatus.Dismissed);
  });

  it("throws for out-of-range values", () => {
    expect(() => parseDisputeStatus(-1)).toThrow("Invalid DisputeStatus");
    expect(() => parseDisputeStatus(5)).toThrow("Must be 0-4");
  });
});

// ─── parseDisputeType ──────────────────────────────────────────────────────

describe("parseDisputeType", () => {
  it("parses all valid types 0-2", () => {
    expect(parseDisputeType(0)).toBe(DisputeType.Company);
    expect(parseDisputeType(1)).toBe(DisputeType.Citizen);
    expect(parseDisputeType(2)).toBe(DisputeType.CourtOrder);
  });

  it("throws for out-of-range values", () => {
    expect(() => parseDisputeType(-1)).toThrow("Invalid DisputeType");
    expect(() => parseDisputeType(3)).toThrow("Must be 0-2");
  });
});

// ─── parseDepositStatus ────────────────────────────────────────────────────

describe("parseDepositStatus", () => {
  it("parses all valid statuses 0-5", () => {
    expect(parseDepositStatus(0)).toBe(DepositStatus.None);
    expect(parseDepositStatus(1)).toBe(DepositStatus.Active);
    expect(parseDepositStatus(2)).toBe(DepositStatus.Frozen);
    expect(parseDepositStatus(3)).toBe(DepositStatus.Released);
    expect(parseDepositStatus(4)).toBe(DepositStatus.Refunded);
    expect(parseDepositStatus(5)).toBe(DepositStatus.Slashed);
  });

  it("throws for out-of-range values", () => {
    expect(() => parseDepositStatus(-1)).toThrow("Invalid DepositStatus");
    expect(() => parseDepositStatus(6)).toThrow("Must be 0-5");
  });
});

// ─── materialIdToBytes32 / bytes32ToMaterialId ─────────────────────────────

describe("materialIdToBytes32 / bytes32ToMaterialId", () => {
  it("round-trips a simple material ID", () => {
    const id = "STEEL_REBAR";
    const encoded = materialIdToBytes32(id);
    expect(encoded).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(bytes32ToMaterialId(encoded)).toBe(id);
  });

  it("round-trips a single character", () => {
    const id = "A";
    const encoded = materialIdToBytes32(id);
    expect(bytes32ToMaterialId(encoded)).toBe(id);
  });

  it("round-trips a 31-byte string (max length)", () => {
    const id = "A".repeat(31);
    const encoded = materialIdToBytes32(id);
    expect(bytes32ToMaterialId(encoded)).toBe(id);
  });

  it("produces a 66-char hex string (0x + 64 hex chars)", () => {
    const encoded = materialIdToBytes32("CEMENT");
    expect(encoded.length).toBe(66);
    expect(encoded.startsWith("0x")).toBe(true);
  });
});

// ─── formatUSDC ────────────────────────────────────────────────────────────

describe("formatUSDC", () => {
  it("formats whole amounts without decimals", () => {
    expect(formatUSDC(1_000_000n)).toBe("1");
  });

  it("formats zero", () => {
    expect(formatUSDC(0n)).toBe("0");
  });

  it("formats fractional amounts", () => {
    expect(formatUSDC(1_250_500_000n)).toBe("1,250.5");
  });

  it("preserves full precision for small fractions", () => {
    expect(formatUSDC(1_000_001n)).toBe("1.000001");
  });

  it("trims trailing zeros in fraction", () => {
    expect(formatUSDC(1_500_000n)).toBe("1.5");
  });

  it("formats large amounts with comma separators", () => {
    // 1,000,000 USDC = 1_000_000 * 1_000_000
    expect(formatUSDC(1_000_000_000_000n)).toBe("1,000,000");
  });

  it("formats sub-dollar amounts", () => {
    // 0.50 USDC = 500_000
    expect(formatUSDC(500_000n)).toBe("0.5");
  });
});

// ─── parseUSDC ─────────────────────────────────────────────────────────────

describe("parseUSDC", () => {
  it("parses whole numbers", () => {
    expect(parseUSDC("1000")).toBe(1_000_000_000n);
  });

  it("parses decimal amounts", () => {
    expect(parseUSDC("1250.50")).toBe(1_250_500_000n);
  });

  it("parses amounts with commas", () => {
    expect(parseUSDC("1,250.50")).toBe(1_250_500_000n);
  });

  it("parses zero", () => {
    expect(parseUSDC("0")).toBe(0n);
  });

  it("parses sub-dollar amounts", () => {
    expect(parseUSDC("0.5")).toBe(500_000n);
  });

  it("parses full 6-decimal precision", () => {
    expect(parseUSDC("1.000001")).toBe(1_000_001n);
  });

  it("truncates beyond 6 decimals", () => {
    expect(parseUSDC("1.1234567")).toBe(1_123_456n);
  });

  it("round-trips with formatUSDC", () => {
    const raw = 12_345_678n;
    expect(parseUSDC(formatUSDC(raw))).toBe(raw);
  });
});

// ─── tenderStateLabel ──────────────────────────────────────────────────────

describe("tenderStateLabel", () => {
  it("returns correct labels for all states", () => {
    expect(tenderStateLabel(TenderState.Created)).toBe("Created");
    expect(tenderStateLabel(TenderState.Bidding)).toBe("Bidding");
    expect(tenderStateLabel(TenderState.Evaluating)).toBe("Evaluating");
    expect(tenderStateLabel(TenderState.Revealed)).toBe("Revealed");
    expect(tenderStateLabel(TenderState.Completed)).toBe("Completed");
    expect(tenderStateLabel(TenderState.Cancelled)).toBe("Cancelled");
  });
});

// ─── depositStatusLabel ────────────────────────────────────────────────────

describe("depositStatusLabel", () => {
  it("returns correct labels for all statuses", () => {
    expect(depositStatusLabel(DepositStatus.None)).toBe("None");
    expect(depositStatusLabel(DepositStatus.Active)).toBe("Active");
    expect(depositStatusLabel(DepositStatus.Frozen)).toBe("Frozen");
    expect(depositStatusLabel(DepositStatus.Released)).toBe("Released");
    expect(depositStatusLabel(DepositStatus.Refunded)).toBe("Refunded");
    expect(depositStatusLabel(DepositStatus.Slashed)).toBe("Slashed");
  });
});
