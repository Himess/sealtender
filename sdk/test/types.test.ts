import { describe, it, expect } from "vitest";
import {
  TenderState,
  DisputeType,
  DisputeStatus,
  DepositStatus,
} from "../src/types";

// ─── TenderState ───────────────────────────────────────────────────────────

describe("TenderState enum", () => {
  it("maps Created to 0", () => {
    expect(TenderState.Created).toBe(0);
  });

  it("maps Bidding to 1", () => {
    expect(TenderState.Bidding).toBe(1);
  });

  it("maps Evaluating to 2", () => {
    expect(TenderState.Evaluating).toBe(2);
  });

  it("maps Revealed to 3", () => {
    expect(TenderState.Revealed).toBe(3);
  });

  it("maps Completed to 4", () => {
    expect(TenderState.Completed).toBe(4);
  });

  it("maps Cancelled to 5", () => {
    expect(TenderState.Cancelled).toBe(5);
  });

  it("has exactly 6 members", () => {
    // Numeric enums produce both forward and reverse mappings,
    // so Object.keys length is 12 (6 names + 6 numbers).
    const names = Object.keys(TenderState).filter((k) => isNaN(Number(k)));
    expect(names).toHaveLength(6);
  });

  it("reverse-maps numeric values to string names", () => {
    expect(TenderState[0]).toBe("Created");
    expect(TenderState[5]).toBe("Cancelled");
  });
});

// ─── DisputeType ───────────────────────────────────────────────────────────

describe("DisputeType enum", () => {
  it("maps Company to 0", () => {
    expect(DisputeType.Company).toBe(0);
  });

  it("maps Citizen to 1", () => {
    expect(DisputeType.Citizen).toBe(1);
  });

  it("maps CourtOrder to 2", () => {
    expect(DisputeType.CourtOrder).toBe(2);
  });

  it("has exactly 3 members", () => {
    const names = Object.keys(DisputeType).filter((k) => isNaN(Number(k)));
    expect(names).toHaveLength(3);
  });
});

// ─── DisputeStatus ─────────────────────────────────────────────────────────

describe("DisputeStatus enum", () => {
  it("maps Open to 0", () => {
    expect(DisputeStatus.Open).toBe(0);
  });

  it("maps Investigating to 1", () => {
    expect(DisputeStatus.Investigating).toBe(1);
  });

  it("maps Slashed to 2", () => {
    expect(DisputeStatus.Slashed).toBe(2);
  });

  it("maps Frozen to 3", () => {
    expect(DisputeStatus.Frozen).toBe(3);
  });

  it("maps Dismissed to 4", () => {
    expect(DisputeStatus.Dismissed).toBe(4);
  });

  it("has exactly 5 members", () => {
    const names = Object.keys(DisputeStatus).filter((k) => isNaN(Number(k)));
    expect(names).toHaveLength(5);
  });
});

// ─── DepositStatus ─────────────────────────────────────────────────────────

describe("DepositStatus enum", () => {
  it("maps None to 0", () => {
    expect(DepositStatus.None).toBe(0);
  });

  it("maps Active to 1", () => {
    expect(DepositStatus.Active).toBe(1);
  });

  it("maps Frozen to 2", () => {
    expect(DepositStatus.Frozen).toBe(2);
  });

  it("maps Released to 3", () => {
    expect(DepositStatus.Released).toBe(3);
  });

  it("maps Refunded to 4", () => {
    expect(DepositStatus.Refunded).toBe(4);
  });

  it("maps Slashed to 5", () => {
    expect(DepositStatus.Slashed).toBe(5);
  });

  it("has exactly 6 members", () => {
    const names = Object.keys(DepositStatus).filter((k) => isNaN(Number(k)));
    expect(names).toHaveLength(6);
  });

  it("reverse-maps numeric values to string names", () => {
    expect(DepositStatus[0]).toBe("None");
    expect(DepositStatus[3]).toBe("Released");
    expect(DepositStatus[5]).toBe("Slashed");
  });
});
