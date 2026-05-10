import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { BidEscrow, ConfidentialUSDC, MockUSDC } from "../typechain-types";
import {
  deployEscrowStack,
  fundCUSDC,
  fundAndDeposit,
  depositCUSDC,
} from "./helpers/escrowSetup";

// v7 BidEscrow — cUSDC-native escrow.
//
// Every test in this file exercises the ERC-7984 deposit/refund/slash path.
// The legacy `payable` ETH path is gone — bidders must:
//   1. mint MockUSDC (test only),
//   2. wrap into cUSDC,
//   3. setOperator(escrow) on cUSDC,
//   4. encrypt the deposit amount,
//   5. call escrow.deposit(tenderId, encAmount, proof).
// The `fundCUSDC` / `fundAndDeposit` helpers in test/helpers/escrowSetup.ts
// bundle steps 1–3 (and 4–5 in fundAndDeposit) for compact test code.
//
// Amounts are denominated in cUSDC fixed-point: 6 decimals. 1 USDC = 1_000_000.
describe("BidEscrow", function () {
  let escrow: BidEscrow;
  let cUSDC: ConfidentialUSDC;
  let usdc: MockUSDC;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let municipality: HardhatEthersSigner;
  const TENDER_ID = 0;
  // 5 cUSDC required for tests.
  const REQUIRED: bigint = 5_000_000n;
  // Mint a generous buffer so wrap + deposit have headroom.
  const MINT_AMOUNT: bigint = 1_000_000_000n; // 1000 cUSDC

  beforeEach(async function () {
    [owner, alice, bob, municipality] = await ethers.getSigners();
    const stack = await deployEscrowStack(owner);
    escrow = stack.escrow;
    cUSDC = stack.cUSDC;
    usdc = stack.usdc;
  });

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      expect(await escrow.owner()).to.equal(owner.address);
    });

    it("should record the cUSDC token reference", async function () {
      expect(await escrow.cToken()).to.equal(await cUSDC.getAddress());
    });

    it("should revert if cToken is zero", async function () {
      const Factory = await ethers.getContractFactory("BidEscrow");
      await expect(
        Factory.deploy(owner.address, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(escrow, "ZeroAddress");
    });
  });

  describe("authorizeCaller", function () {
    it("should authorize a caller", async function () {
      await escrow.authorizeCaller(alice.address);
      expect(await escrow.authorizedCallers(alice.address)).to.be.true;
    });

    it("should revert on zero address", async function () {
      await expect(escrow.authorizeCaller(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(escrow, "ZeroAddress");
    });

    it("should only allow owner to authorize", async function () {
      await expect(escrow.connect(alice).authorizeCaller(bob.address))
        .to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });
  });

  describe("setRequiredDeposit", function () {
    it("should set required deposit as owner", async function () {
      await expect(escrow.setRequiredDeposit(TENDER_ID, REQUIRED))
        .to.emit(escrow, "RequiredDepositSet")
        .withArgs(TENDER_ID, REQUIRED);
      expect(await escrow.requiredDeposit(TENDER_ID)).to.equal(REQUIRED);
    });

    it("should allow authorized caller to set required deposit", async function () {
      await escrow.authorizeCaller(alice.address);
      await escrow.connect(alice).setRequiredDeposit(TENDER_ID, REQUIRED);
      expect(await escrow.requiredDeposit(TENDER_ID)).to.equal(REQUIRED);
    });

    it("should revert for unauthorized caller", async function () {
      await expect(escrow.connect(alice).setRequiredDeposit(TENDER_ID, REQUIRED))
        .to.be.revertedWithCustomError(escrow, "NotAuthorized");
    });
  });

  describe("deposit (cUSDC)", function () {
    beforeEach(async function () {
      await escrow.setRequiredDeposit(TENDER_ID, REQUIRED);
      await fundCUSDC(usdc, cUSDC, alice, MINT_AMOUNT, escrow);
    });

    it("should accept an encrypted deposit and flip hasDeposited", async function () {
      await depositCUSDC(escrow, cUSDC, alice, TENDER_ID, REQUIRED);
      expect(await escrow.hasDeposited(TENDER_ID, alice.address)).to.be.true;
    });

    it("should mark depositStatus Active", async function () {
      await depositCUSDC(escrow, cUSDC, alice, TENDER_ID, REQUIRED);
      expect(await escrow.getDepositStatus(TENDER_ID, alice.address)).to.equal(1); // Active
    });

    it("should emit EscrowDeposited", async function () {
      const { handle, proof } = await (async () => {
        const input = fhevm.createEncryptedInput(
          await cUSDC.getAddress(),
          await escrow.getAddress()
        );
        input.add64(REQUIRED);
        const enc = await input.encrypt();
        return { handle: enc.handles[0], proof: enc.inputProof };
      })();
      await expect(
        escrow.connect(alice).deposit(TENDER_ID, handle as any, proof as any)
      )
        .to.emit(escrow, "EscrowDeposited")
        .withArgs(TENDER_ID, alice.address);
    });

    it("should expose legacy deposits() shim returning 1 after deposit", async function () {
      await depositCUSDC(escrow, cUSDC, alice, TENDER_ID, REQUIRED);
      // The legacy ETH-era ABI exposed deposits(tenderId, bidder) as uint256.
      // v7 keeps the function as a boolean-coded shim (1 = deposited, 0 = not).
      expect(await escrow.deposits(TENDER_ID, alice.address)).to.equal(1);
    });

    it("should revert on duplicate deposit", async function () {
      await depositCUSDC(escrow, cUSDC, alice, TENDER_ID, REQUIRED);
      const { handle, proof } = await (async () => {
        const input = fhevm.createEncryptedInput(
          await cUSDC.getAddress(),
          await escrow.getAddress()
        );
        input.add64(REQUIRED);
        const enc = await input.encrypt();
        return { handle: enc.handles[0], proof: enc.inputProof };
      })();
      await expect(
        escrow.connect(alice).deposit(TENDER_ID, handle as any, proof as any)
      ).to.be.revertedWithCustomError(escrow, "DepositAlreadyExists");
    });

    it("should revert when tender requires no deposit (required=0)", async function () {
      const UNCONFIGURED_TENDER_ID = 999;
      const { handle, proof } = await (async () => {
        const input = fhevm.createEncryptedInput(
          await cUSDC.getAddress(),
          await escrow.getAddress()
        );
        input.add64(REQUIRED);
        const enc = await input.encrypt();
        return { handle: enc.handles[0], proof: enc.inputProof };
      })();
      await expect(
        escrow.connect(alice).deposit(UNCONFIGURED_TENDER_ID, handle as any, proof as any)
      ).to.be.revertedWithCustomError(escrow, "TenderNotConfigured");
    });
  });

  describe("release / refund", function () {
    beforeEach(async function () {
      await escrow.setRequiredDeposit(TENDER_ID, REQUIRED);
      await fundCUSDC(usdc, cUSDC, alice, MINT_AMOUNT, escrow);
      await depositCUSDC(escrow, cUSDC, alice, TENDER_ID, REQUIRED);
    });

    it("should release deposit to bidder and flip status to Released", async function () {
      await expect(escrow.release(TENDER_ID, alice.address))
        .to.emit(escrow, "EscrowReleased")
        .withArgs(TENDER_ID, alice.address);
      expect(await escrow.getDepositStatus(TENDER_ID, alice.address)).to.equal(3); // Released
    });

    it("should refund deposit and flip status to Refunded", async function () {
      await expect(escrow.refund(TENDER_ID, alice.address))
        .to.emit(escrow, "EscrowRefunded")
        .withArgs(TENDER_ID, alice.address);
      expect(await escrow.getDepositStatus(TENDER_ID, alice.address)).to.equal(4); // Refunded
    });

    it("should revert release if not active", async function () {
      await escrow.release(TENDER_ID, alice.address);
      await expect(escrow.release(TENDER_ID, alice.address))
        .to.be.revertedWithCustomError(escrow, "DepositNotActive");
    });

    it("should revert release for unauthorized caller", async function () {
      // The fhevm hardhat plugin wraps custom-error reverts as a generic
      // "Fhevm assertion failed" when the revert happens before any FHE op.
      try {
        await escrow.connect(alice).release(TENDER_ID, alice.address);
        expect.fail("Expected revert");
      } catch (e: any) {
        expect(e.message || e.toString()).to.satisfy((m: string) =>
          m.includes("NotAuthorized") || m.includes("assertion failed")
        );
      }
    });
  });

  describe("freeze / unfreeze", function () {
    beforeEach(async function () {
      await escrow.setRequiredDeposit(TENDER_ID, REQUIRED);
      await fundCUSDC(usdc, cUSDC, alice, MINT_AMOUNT, escrow);
      await depositCUSDC(escrow, cUSDC, alice, TENDER_ID, REQUIRED);
    });

    it("should freeze an active deposit", async function () {
      await expect(escrow.freeze(TENDER_ID, alice.address))
        .to.emit(escrow, "EscrowFrozen")
        .withArgs(TENDER_ID, alice.address);
      expect(await escrow.getDepositStatus(TENDER_ID, alice.address)).to.equal(2); // Frozen
    });

    it("should unfreeze a frozen deposit", async function () {
      await escrow.freeze(TENDER_ID, alice.address);
      await expect(escrow.unfreeze(TENDER_ID, alice.address))
        .to.emit(escrow, "EscrowUnfrozen")
        .withArgs(TENDER_ID, alice.address);
      expect(await escrow.getDepositStatus(TENDER_ID, alice.address)).to.equal(1); // Active
    });

    it("should revert freeze on non-active deposit", async function () {
      await escrow.freeze(TENDER_ID, alice.address);
      await expect(escrow.freeze(TENDER_ID, alice.address))
        .to.be.revertedWithCustomError(escrow, "DepositNotActive");
    });

    it("should revert unfreeze on non-frozen deposit", async function () {
      await expect(escrow.unfreeze(TENDER_ID, alice.address))
        .to.be.revertedWithCustomError(escrow, "DepositFrozen");
    });
  });

  describe("slash", function () {
    beforeEach(async function () {
      await escrow.setRequiredDeposit(TENDER_ID, REQUIRED);
      await fundCUSDC(usdc, cUSDC, alice, MINT_AMOUNT, escrow);
      await depositCUSDC(escrow, cUSDC, alice, TENDER_ID, REQUIRED);
    });

    it("should slash from active deposit and flip status to Slashed", async function () {
      await expect(escrow.slash(TENDER_ID, alice.address, municipality.address))
        .to.emit(escrow, "EscrowSlashed")
        .withArgs(TENDER_ID, alice.address, municipality.address);
      expect(await escrow.getDepositStatus(TENDER_ID, alice.address)).to.equal(5); // Slashed
    });

    it("should slash from frozen deposit", async function () {
      await escrow.freeze(TENDER_ID, alice.address);
      await expect(escrow.slash(TENDER_ID, alice.address, municipality.address))
        .to.emit(escrow, "EscrowSlashed");
    });

    it("should revert slash to zero address", async function () {
      await expect(escrow.slash(TENDER_ID, alice.address, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(escrow, "ZeroAddress");
    });
  });

  describe("Views", function () {
    it("should return the encrypted deposit handle via getDeposit", async function () {
      await escrow.setRequiredDeposit(TENDER_ID, REQUIRED);
      await fundCUSDC(usdc, cUSDC, alice, MINT_AMOUNT, escrow);
      await depositCUSDC(escrow, cUSDC, alice, TENDER_ID, REQUIRED);

      const handle = await escrow.getDeposit(TENDER_ID, alice.address);
      // Initialized euint64 is a non-zero bytes32 ciphertext handle.
      expect(handle).to.not.equal(ethers.ZeroHash);
    });
  });

  describe("claimRefund (permissionless cancel path)", function () {
    let mockTender: any;
    const TENDER_STATE_BIDDING = 1;
    const TENDER_STATE_CANCELLED = 5;

    beforeEach(async function () {
      const MockFactory = await ethers.getContractFactory("MockTenderStateReader");
      mockTender = await MockFactory.deploy();
      await mockTender.waitForDeployment();

      await escrow.setRequiredDeposit(TENDER_ID, REQUIRED);
      await escrow.setTenderAddress(TENDER_ID, await mockTender.getAddress());
      await fundCUSDC(usdc, cUSDC, alice, MINT_AMOUNT, escrow);
      await depositCUSDC(escrow, cUSDC, alice, TENDER_ID, REQUIRED);
    });

    it("should record the tender address", async function () {
      expect(await escrow.tenderOf(TENDER_ID)).to.equal(await mockTender.getAddress());
    });

    it("should revert claimRefund when tender is not Cancelled", async function () {
      await mockTender.setState(TENDER_STATE_BIDDING);
      await expect(escrow.connect(alice).claimRefund(TENDER_ID))
        .to.be.revertedWithCustomError(escrow, "TenderNotCancelled");
    });

    it("should revert claimRefund for unknown tender", async function () {
      await expect(escrow.connect(alice).claimRefund(99))
        .to.be.revertedWithCustomError(escrow, "TenderUnknown");
    });

    it("should refund permissionlessly once tender is Cancelled", async function () {
      await mockTender.setState(TENDER_STATE_CANCELLED);
      await expect(escrow.connect(alice).claimRefund(TENDER_ID))
        .to.emit(escrow, "EscrowRefunded")
        .withArgs(TENDER_ID, alice.address)
        .and.to.emit(escrow, "RefundClaimed")
        .withArgs(TENDER_ID, alice.address);

      expect(await escrow.depositStatus(TENDER_ID, alice.address)).to.equal(4); // Refunded
    });

    it("should revert when caller has no active deposit", async function () {
      await mockTender.setState(TENDER_STATE_CANCELLED);
      await expect(escrow.connect(bob).claimRefund(TENDER_ID))
        .to.be.revertedWithCustomError(escrow, "DepositNotActive");
    });
  });
});
