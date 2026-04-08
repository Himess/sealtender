import { describe, it, expect } from "vitest";
import {
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
} from "../src/constants";

// ─── Chain Configuration ───────────────────────────────────────────────────

describe("chain configuration", () => {
  it("SEPOLIA_CHAIN_ID is 11155111", () => {
    expect(SEPOLIA_CHAIN_ID).toBe(11155111);
  });

  it("KMS_CONTRACT_ADDRESS is a valid hex address", () => {
    expect(KMS_CONTRACT_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("ACL_CONTRACT_ADDRESS is a valid hex address", () => {
    expect(ACL_CONTRACT_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("GATEWAY_URL is a valid HTTPS URL", () => {
    expect(GATEWAY_URL).toMatch(/^https:\/\//);
  });
});

// ─── Default Addresses ─────────────────────────────────────────────────────

describe("DEFAULT_ADDRESSES", () => {
  const addressKeys = [
    "factory",
    "escrow",
    "registry",
    "disputeManager",
    "escalation",
    "collisionDetector",
    "cusdc",
  ] as const;

  it("contains all 7 required address fields", () => {
    for (const key of addressKeys) {
      expect(DEFAULT_ADDRESSES).toHaveProperty(key);
    }
  });

  it("each address is a valid 42-char hex string with 0x prefix", () => {
    for (const key of addressKeys) {
      const addr = DEFAULT_ADDRESSES[key];
      expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(addr.length).toBe(42);
    }
  });
});

// ─── ABIs ──────────────────────────────────────────────────────────────────

describe("ABIs", () => {
  it("FACTORY_ABI is a non-empty array", () => {
    expect(Array.isArray(FACTORY_ABI)).toBe(true);
    expect(FACTORY_ABI.length).toBeGreaterThan(0);
  });

  it("TENDER_ABI is a non-empty array", () => {
    expect(Array.isArray(TENDER_ABI)).toBe(true);
    expect(TENDER_ABI.length).toBeGreaterThan(0);
  });

  it("ESCROW_ABI is a non-empty array", () => {
    expect(Array.isArray(ESCROW_ABI)).toBe(true);
    expect(ESCROW_ABI.length).toBeGreaterThan(0);
  });

  it("REGISTRY_ABI is a non-empty array", () => {
    expect(Array.isArray(REGISTRY_ABI)).toBe(true);
    expect(REGISTRY_ABI.length).toBeGreaterThan(0);
  });

  it("DISPUTE_MANAGER_ABI is a non-empty array", () => {
    expect(Array.isArray(DISPUTE_MANAGER_ABI)).toBe(true);
    expect(DISPUTE_MANAGER_ABI.length).toBeGreaterThan(0);
  });

  it("ESCALATION_ABI is a non-empty array", () => {
    expect(Array.isArray(ESCALATION_ABI)).toBe(true);
    expect(ESCALATION_ABI.length).toBeGreaterThan(0);
  });

  it("COLLISION_DETECTOR_ABI is a non-empty array", () => {
    expect(Array.isArray(COLLISION_DETECTOR_ABI)).toBe(true);
    expect(COLLISION_DETECTOR_ABI.length).toBeGreaterThan(0);
  });

  it("CUSDC_ABI is a non-empty array", () => {
    expect(Array.isArray(CUSDC_ABI)).toBe(true);
    expect(CUSDC_ABI.length).toBeGreaterThan(0);
  });

  it("all ABI entries are strings", () => {
    const allAbis = [
      FACTORY_ABI,
      TENDER_ABI,
      ESCROW_ABI,
      REGISTRY_ABI,
      DISPUTE_MANAGER_ABI,
      ESCALATION_ABI,
      COLLISION_DETECTOR_ABI,
      CUSDC_ABI,
    ];
    for (const abi of allAbis) {
      for (const entry of abi) {
        expect(typeof entry).toBe("string");
      }
    }
  });

  it("FACTORY_ABI includes createTender function", () => {
    expect(FACTORY_ABI.some((e) => e.includes("createTender"))).toBe(true);
  });

  it("TENDER_ABI includes submitBid function", () => {
    expect(TENDER_ABI.some((e) => e.includes("submitBid"))).toBe(true);
  });

  it("ESCROW_ABI includes deposit function", () => {
    expect(ESCROW_ABI.some((e) => e.includes("deposit"))).toBe(true);
  });

  it("should have IAggregatorV3 in project", () => {
    const fs = require("fs");
    const path = require("path");
    const interfacePath = path.resolve(__dirname, "../../contracts/interfaces/IAggregatorV3.sol");
    expect(fs.existsSync(interfacePath)).toBe(true);
  });
});
