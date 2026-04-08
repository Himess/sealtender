import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { BidEscrow } from "../typechain-types";

describe("BidEscrow", function () {
  let escrow: BidEscrow;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let municipality: HardhatEthersSigner;
  const TENDER_ID = 0;
  const DEPOSIT_AMOUNT = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, alice, bob, municipality] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BidEscrow");
    escrow = await Factory.deploy();
    await escrow.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      expect(await escrow.owner()).to.equal(owner.address);
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
      await expect(escrow.setRequiredDeposit(TENDER_ID, DEPOSIT_AMOUNT))
        .to.emit(escrow, "RequiredDepositSet")
        .withArgs(TENDER_ID, DEPOSIT_AMOUNT);
      expect(await escrow.requiredDeposit(TENDER_ID)).to.equal(DEPOSIT_AMOUNT);
    });

    it("should allow authorized caller to set required deposit", async function () {
      await escrow.authorizeCaller(alice.address);
      await escrow.connect(alice).setRequiredDeposit(TENDER_ID, DEPOSIT_AMOUNT);
      expect(await escrow.requiredDeposit(TENDER_ID)).to.equal(DEPOSIT_AMOUNT);
    });

    it("should revert for unauthorized caller", async function () {
      await expect(escrow.connect(alice).setRequiredDeposit(TENDER_ID, DEPOSIT_AMOUNT))
        .to.be.revertedWithCustomError(escrow, "NotAuthorized");
    });
  });

  describe("deposit", function () {
    beforeEach(async function () {
      await escrow.setRequiredDeposit(TENDER_ID, DEPOSIT_AMOUNT);
    });

    it("should accept deposit meeting required amount", async function () {
      await expect(escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT_AMOUNT }))
        .to.emit(escrow, "EscrowDeposited")
        .withArgs(TENDER_ID, alice.address, DEPOSIT_AMOUNT);
    });

    it("should track deposit amount", async function () {
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT_AMOUNT });
      expect(await escrow.deposits(TENDER_ID, alice.address)).to.equal(DEPOSIT_AMOUNT);
    });

    it("should track total escrow", async function () {
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT_AMOUNT });
      expect(await escrow.totalEscrow(TENDER_ID)).to.equal(DEPOSIT_AMOUNT);
    });

    it("should revert on insufficient deposit", async function () {
      await expect(escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT_AMOUNT / 2n }))
        .to.be.revertedWithCustomError(escrow, "InsufficientDeposit");
    });

    it("should revert on duplicate deposit", async function () {
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT_AMOUNT });
      await expect(escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT_AMOUNT }))
        .to.be.revertedWithCustomError(escrow, "DepositAlreadyExists");
    });

    it("should set deposit status to Active", async function () {
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT_AMOUNT });
      expect(await escrow.getDepositStatus(TENDER_ID, alice.address)).to.equal(1); // Active
    });
  });

  describe("release", function () {
    beforeEach(async function () {
      await escrow.setRequiredDeposit(TENDER_ID, DEPOSIT_AMOUNT);
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT_AMOUNT });
    });

    it("should release deposit to bidder", async function () {
      await expect(escrow.release(TENDER_ID, alice.address))
        .to.emit(escrow, "EscrowReleased")
        .withArgs(TENDER_ID, alice.address, DEPOSIT_AMOUNT);
    });

    it("should set status to Released", async function () {
      await escrow.release(TENDER_ID, alice.address);
      expect(await escrow.getDepositStatus(TENDER_ID, alice.address)).to.equal(3); // Released
    });

    it("should revert if not active", async function () {
      await escrow.release(TENDER_ID, alice.address);
      await expect(escrow.release(TENDER_ID, alice.address))
        .to.be.revertedWithCustomError(escrow, "DepositNotActive");
    });

    it("should revert for unauthorized caller", async function () {
      try {
        await escrow.connect(alice).release(TENDER_ID, alice.address);
        expect.fail("Expected revert");
      } catch (e: any) {
        // fhevm plugin wraps custom errors as "Fhevm assertion failed."
        expect(e.message || e.toString()).to.satisfy(
          (msg: string) => msg.includes("NotAuthorized") || msg.includes("assertion failed")
        );
      }
    });
  });

  describe("refund", function () {
    beforeEach(async function () {
      await escrow.setRequiredDeposit(TENDER_ID, DEPOSIT_AMOUNT);
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT_AMOUNT });
    });

    it("should refund deposit to bidder", async function () {
      await expect(escrow.refund(TENDER_ID, alice.address))
        .to.emit(escrow, "EscrowRefunded")
        .withArgs(TENDER_ID, alice.address, DEPOSIT_AMOUNT);
    });

    it("should set status to Refunded", async function () {
      await escrow.refund(TENDER_ID, alice.address);
      expect(await escrow.getDepositStatus(TENDER_ID, alice.address)).to.equal(4); // Refunded
    });
  });

  describe("freeze / unfreeze", function () {
    beforeEach(async function () {
      await escrow.setRequiredDeposit(TENDER_ID, DEPOSIT_AMOUNT);
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT_AMOUNT });
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
      await escrow.setRequiredDeposit(TENDER_ID, DEPOSIT_AMOUNT);
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT_AMOUNT });
    });

    it("should slash from active deposit", async function () {
      await expect(escrow.slash(TENDER_ID, alice.address, municipality.address))
        .to.emit(escrow, "EscrowSlashed")
        .withArgs(TENDER_ID, alice.address, municipality.address, DEPOSIT_AMOUNT);
    });

    it("should slash from frozen deposit", async function () {
      await escrow.freeze(TENDER_ID, alice.address);
      await expect(escrow.slash(TENDER_ID, alice.address, municipality.address))
        .to.emit(escrow, "EscrowSlashed");
    });

    it("should set status to Slashed", async function () {
      await escrow.slash(TENDER_ID, alice.address, municipality.address);
      expect(await escrow.getDepositStatus(TENDER_ID, alice.address)).to.equal(5); // Slashed
    });

    it("should revert slash to zero address", async function () {
      await expect(escrow.slash(TENDER_ID, alice.address, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(escrow, "ZeroAddress");
    });
  });

  describe("Views", function () {
    it("should return deposit amount via getDeposit", async function () {
      await escrow.setRequiredDeposit(TENDER_ID, DEPOSIT_AMOUNT);
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT_AMOUNT });
      expect(await escrow.getDeposit(TENDER_ID, alice.address)).to.equal(DEPOSIT_AMOUNT);
    });

    it("should return zero for non-existent deposit", async function () {
      expect(await escrow.getDeposit(TENDER_ID, alice.address)).to.equal(0);
    });
  });
});
