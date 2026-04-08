import { describe, it, expect } from "vitest";
import {
  SealTenderError,
  FHEEncryptionError,
  ContractCallError,
  TransactionError,
  ValidationError,
  WalletNotConnectedError,
} from "../src/errors";

// ─── SealTenderError (base) ────────────────────────────────────────────────

describe("SealTenderError", () => {
  it("sets message and code correctly", () => {
    const err = new SealTenderError("something failed", "SOME_CODE");
    expect(err.message).toBe("something failed");
    expect(err.code).toBe("SOME_CODE");
    expect(err.name).toBe("SealTenderError");
  });

  it("is an instance of Error", () => {
    const err = new SealTenderError("msg", "CODE");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SealTenderError);
  });
});

// ─── FHEEncryptionError ────────────────────────────────────────────────────

describe("FHEEncryptionError", () => {
  it("sets name, code, and message", () => {
    const err = new FHEEncryptionError("encryption failed");
    expect(err.name).toBe("FHEEncryptionError");
    expect(err.code).toBe("FHE_ENCRYPTION_FAILED");
    expect(err.message).toBe("encryption failed");
  });

  it("is an instance of SealTenderError and Error", () => {
    const err = new FHEEncryptionError("msg");
    expect(err).toBeInstanceOf(SealTenderError);
    expect(err).toBeInstanceOf(Error);
  });
});

// ─── ContractCallError ─────────────────────────────────────────────────────

describe("ContractCallError", () => {
  it("formats message with contract and function name", () => {
    const err = new ContractCallError("reverted", "BidEscrow", "deposit");
    expect(err.message).toBe("BidEscrow.deposit: reverted");
    expect(err.contractName).toBe("BidEscrow");
    expect(err.functionName).toBe("deposit");
  });

  it("sets correct name and code", () => {
    const err = new ContractCallError("err", "X", "Y");
    expect(err.name).toBe("ContractCallError");
    expect(err.code).toBe("CONTRACT_CALL_FAILED");
  });

  it("is an instance of SealTenderError", () => {
    const err = new ContractCallError("err", "X", "Y");
    expect(err).toBeInstanceOf(SealTenderError);
  });
});

// ─── TransactionError ──────────────────────────────────────────────────────

describe("TransactionError", () => {
  it("sets message and code", () => {
    const err = new TransactionError("tx failed");
    expect(err.message).toBe("tx failed");
    expect(err.code).toBe("TRANSACTION_FAILED");
    expect(err.name).toBe("TransactionError");
  });

  it("stores optional txHash", () => {
    const err = new TransactionError("tx failed", "0xabc123");
    expect(err.txHash).toBe("0xabc123");
  });

  it("txHash is undefined when not provided", () => {
    const err = new TransactionError("tx failed");
    expect(err.txHash).toBeUndefined();
  });

  it("is an instance of SealTenderError", () => {
    const err = new TransactionError("msg");
    expect(err).toBeInstanceOf(SealTenderError);
  });
});

// ─── ValidationError ───────────────────────────────────────────────────────

describe("ValidationError", () => {
  it("sets message, code, and field", () => {
    const err = new ValidationError("price too low", "price");
    expect(err.message).toBe("price too low");
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.field).toBe("price");
    expect(err.name).toBe("ValidationError");
  });

  it("is an instance of SealTenderError", () => {
    const err = new ValidationError("msg", "field");
    expect(err).toBeInstanceOf(SealTenderError);
  });
});

// ─── WalletNotConnectedError ───────────────────────────────────────────────

describe("WalletNotConnectedError", () => {
  it("has fixed message and code", () => {
    const err = new WalletNotConnectedError();
    expect(err.message).toBe(
      "Wallet not connected. Please connect your wallet first."
    );
    expect(err.code).toBe("WALLET_NOT_CONNECTED");
    expect(err.name).toBe("WalletNotConnectedError");
  });

  it("is an instance of SealTenderError and Error", () => {
    const err = new WalletNotConnectedError();
    expect(err).toBeInstanceOf(SealTenderError);
    expect(err).toBeInstanceOf(Error);
  });

  it("requires no constructor arguments", () => {
    // Just verifying it can be instantiated with no args
    expect(() => new WalletNotConnectedError()).not.toThrow();
  });
});
