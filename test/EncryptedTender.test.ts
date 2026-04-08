import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { EncryptedTender, BidderRegistry, BidEscrow } from "../typechain-types";

describe("EncryptedTender", function () {
  let tender: EncryptedTender;
  let registry: BidderRegistry;
  let escrow: BidEscrow;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;
  let deadline: number;

  const defaultConfig = () => ({
    description: "Road Construction",
    deadline: deadline,
    weightYears: 30,
    weightProjects: 30,
    weightBond: 40,
    minYears: 2,
    minProjects: 3,
    minBond: 5000,
    escrowAmount: 0,
    maxBidders: 5,
    minReputation: 0,
  });

  async function deployTender(configOverrides: any = {}) {
    deadline = (await time.latest()) + 86400;
    const config = { ...defaultConfig(), ...configOverrides };
    const Factory = await ethers.getContractFactory("EncryptedTender");
    tender = await Factory.deploy(
      0, config, await registry.getAddress(), await escrow.getAddress()
    );
    await tender.waitForDeployment();
    // Authorize tender on registry
    await registry.addAuthorizedCaller(await tender.getAddress());
    return tender;
  }

  beforeEach(async function () {
    [owner, alice, bob, charlie] = await ethers.getSigners();

    const RegistryFactory = await ethers.getContractFactory("BidderRegistry");
    registry = await RegistryFactory.deploy(owner.address);
    await registry.waitForDeployment();

    const EscrowFactory = await ethers.getContractFactory("BidEscrow");
    escrow = await EscrowFactory.deploy();
    await escrow.waitForDeployment();

    // Register and verify bidders
    await registry.registerBidder(alice.address);
    await registry.registerBidder(bob.address);
    await registry.registerBidder(charlie.address);

    await deployTender();
  });

  describe("Deployment", function () {
    it("should set correct tender ID", async function () {
      expect(await tender.tenderId()).to.equal(0);
    });

    it("should set state to Bidding", async function () {
      expect(await tender.state()).to.equal(1); // Bidding
    });

    it("should set correct registry", async function () {
      expect(await tender.registry()).to.equal(await registry.getAddress());
    });

    it("should set correct escrow", async function () {
      expect(await tender.escrow()).to.equal(await escrow.getAddress());
    });

    it("should revert with past deadline", async function () {
      const Factory = await ethers.getContractFactory("EncryptedTender");
      const pastConfig = { ...defaultConfig(), deadline: (await time.latest()) - 1 };
      await expect(
        Factory.deploy(0, pastConfig, await registry.getAddress(), await escrow.getAddress())
      ).to.be.revertedWith("Deadline must be future");
    });

    it("should revert with zero maxBidders", async function () {
      const Factory = await ethers.getContractFactory("EncryptedTender");
      const config = { ...defaultConfig(), maxBidders: 0 };
      await expect(
        Factory.deploy(0, config, await registry.getAddress(), await escrow.getAddress())
      ).to.be.revertedWith("Must allow at least 1 bidder");
    });

    it("should revert with maxBidders > 10", async function () {
      const Factory = await ethers.getContractFactory("EncryptedTender");
      const config = { ...defaultConfig(), maxBidders: 11 };
      await expect(
        Factory.deploy(0, config, await registry.getAddress(), await escrow.getAddress())
      ).to.be.revertedWith("Max 10 bidders");
    });
  });

  describe("submitBid", function () {
    it("should accept bid from verified bidder", async function () {
      const addr = await tender.getAddress();
      const encPrice = await fhevm.encryptUint(5, 50000n, addr, alice.address);
      const encYears = await fhevm.encryptUint(4, 5n, addr, alice.address);
      const encProjects = await fhevm.encryptUint(4, 10n, addr, alice.address);
      const encBond = await fhevm.encryptUint(5, 10000n, addr, alice.address);

      await expect(
        tender.connect(alice).submitBid(
          encPrice.externalEuint, encPrice.inputProof,
          encYears.externalEuint, encYears.inputProof,
          encProjects.externalEuint, encProjects.inputProof,
          encBond.externalEuint, encBond.inputProof
        )
      ).to.emit(tender, "BidSubmitted");
    });

    it("should increment bidder count", async function () {
      const addr = await tender.getAddress();
      const encPrice = await fhevm.encryptUint(5, 50000n, addr, alice.address);
      const encYears = await fhevm.encryptUint(4, 5n, addr, alice.address);
      const encProjects = await fhevm.encryptUint(4, 10n, addr, alice.address);
      const encBond = await fhevm.encryptUint(5, 10000n, addr, alice.address);

      await tender.connect(alice).submitBid(
        encPrice.externalEuint, encPrice.inputProof,
        encYears.externalEuint, encYears.inputProof,
        encProjects.externalEuint, encProjects.inputProof,
        encBond.externalEuint, encBond.inputProof
      );

      expect(await tender.bidders(0)).to.equal(alice.address);
    });

    it("should revert for unverified bidder", async function () {
      const [,,,,unverified] = await ethers.getSigners();
      const addr = await tender.getAddress();
      const encPrice = await fhevm.encryptUint(5, 50000n, addr, unverified.address);
      const encYears = await fhevm.encryptUint(4, 5n, addr, unverified.address);
      const encProjects = await fhevm.encryptUint(4, 10n, addr, unverified.address);
      const encBond = await fhevm.encryptUint(5, 10000n, addr, unverified.address);

      try {
        await tender.connect(unverified).submitBid(
          encPrice.externalEuint, encPrice.inputProof,
          encYears.externalEuint, encYears.inputProof,
          encProjects.externalEuint, encProjects.inputProof,
          encBond.externalEuint, encBond.inputProof
        );
        expect.fail("Expected revert");
      } catch (e: any) {
        expect(e.message || e.toString()).to.satisfy(
          (msg: string) => msg.includes("NotVerifiedBidder") || msg.includes("assertion failed")
        );
      }
    });

    it("should revert after deadline", async function () {
      await time.increase(86401);
      const addr = await tender.getAddress();
      const encPrice = await fhevm.encryptUint(5, 50000n, addr, alice.address);
      const encYears = await fhevm.encryptUint(4, 5n, addr, alice.address);
      const encProjects = await fhevm.encryptUint(4, 10n, addr, alice.address);
      const encBond = await fhevm.encryptUint(5, 10000n, addr, alice.address);

      try {
        await tender.connect(alice).submitBid(
          encPrice.externalEuint, encPrice.inputProof,
          encYears.externalEuint, encYears.inputProof,
          encProjects.externalEuint, encProjects.inputProof,
          encBond.externalEuint, encBond.inputProof
        );
        expect.fail("Expected revert");
      } catch (e: any) {
        expect(e.message || e.toString()).to.satisfy(
          (msg: string) => msg.includes("DeadlinePassed") || msg.includes("assertion failed")
        );
      }
    });

    it("should revert when tender is full", async function () {
      await deployTender({ maxBidders: 1 });
      await registry.addAuthorizedCaller(await tender.getAddress());

      const addr = await tender.getAddress();
      // First bid
      const encPrice = await fhevm.encryptUint(5, 50000n, addr, alice.address);
      const encYears = await fhevm.encryptUint(4, 5n, addr, alice.address);
      const encProjects = await fhevm.encryptUint(4, 10n, addr, alice.address);
      const encBond = await fhevm.encryptUint(5, 10000n, addr, alice.address);
      await tender.connect(alice).submitBid(
        encPrice.externalEuint, encPrice.inputProof,
        encYears.externalEuint, encYears.inputProof,
        encProjects.externalEuint, encProjects.inputProof,
        encBond.externalEuint, encBond.inputProof
      );

      // Second bid should fail
      const encPrice2 = await fhevm.encryptUint(5, 60000n, addr, bob.address);
      const encYears2 = await fhevm.encryptUint(4, 6n, addr, bob.address);
      const encProjects2 = await fhevm.encryptUint(4, 8n, addr, bob.address);
      const encBond2 = await fhevm.encryptUint(5, 12000n, addr, bob.address);
      await expect(
        tender.connect(bob).submitBid(
          encPrice2.externalEuint, encPrice2.inputProof,
          encYears2.externalEuint, encYears2.inputProof,
          encProjects2.externalEuint, encProjects2.inputProof,
          encBond2.externalEuint, encBond2.inputProof
        )
      ).to.be.revertedWithCustomError(tender, "MaxBiddersReached");
    });

    it("should allow bid update (re-submit)", async function () {
      const addr = await tender.getAddress();
      const enc = async (v: bigint) => fhevm.encryptUint(5, v, addr, alice.address);
      const enc32 = async (v: bigint) => fhevm.encryptUint(4, v, addr, alice.address);

      const p1 = await enc(50000n);
      const y1 = await enc32(5n);
      const pr1 = await enc32(10n);
      const b1 = await enc(10000n);
      await tender.connect(alice).submitBid(
        p1.externalEuint, p1.inputProof,
        y1.externalEuint, y1.inputProof,
        pr1.externalEuint, pr1.inputProof,
        b1.externalEuint, b1.inputProof
      );

      // Re-submit (update)
      const p2 = await enc(40000n);
      const y2 = await enc32(6n);
      const pr2 = await enc32(12n);
      const b2 = await enc(15000n);
      await expect(
        tender.connect(alice).submitBid(
          p2.externalEuint, p2.inputProof,
          y2.externalEuint, y2.inputProof,
          pr2.externalEuint, pr2.inputProof,
          b2.externalEuint, b2.inputProof
        )
      ).to.emit(tender, "BidUpdated");
    });
  });

  describe("Pausable", function () {
    it("should allow owner to pause", async function () {
      await tender.pause();
      expect(await tender.paused()).to.be.true;
    });

    it("should allow owner to unpause", async function () {
      await tender.pause();
      await tender.unpause();
      expect(await tender.paused()).to.be.false;
    });

    it("should revert bid when paused", async function () {
      await tender.pause();
      const addr = await tender.getAddress();
      const encPrice = await fhevm.encryptUint(5, 50000n, addr, alice.address);
      const encYears = await fhevm.encryptUint(4, 5n, addr, alice.address);
      const encProjects = await fhevm.encryptUint(4, 10n, addr, alice.address);
      const encBond = await fhevm.encryptUint(5, 10000n, addr, alice.address);

      await expect(
        tender.connect(alice).submitBid(
          encPrice.externalEuint, encPrice.inputProof,
          encYears.externalEuint, encYears.inputProof,
          encProjects.externalEuint, encProjects.inputProof,
          encBond.externalEuint, encBond.inputProof
        )
      ).to.be.revertedWithCustomError(tender, "EnforcedPause");
    });
  });

  describe("evaluateBatch", function () {
    async function submitBidForSigner(signer: HardhatEthersSigner, price: bigint) {
      const addr = await tender.getAddress();
      const encPrice = await fhevm.encryptUint(5, price, addr, signer.address);
      const encYears = await fhevm.encryptUint(4, 5n, addr, signer.address);
      const encProjects = await fhevm.encryptUint(4, 10n, addr, signer.address);
      const encBond = await fhevm.encryptUint(5, 10000n, addr, signer.address);
      await tender.connect(signer).submitBid(
        encPrice.externalEuint, encPrice.inputProof,
        encYears.externalEuint, encYears.inputProof,
        encProjects.externalEuint, encProjects.inputProof,
        encBond.externalEuint, encBond.inputProof
      );
    }

    it("should start evaluation after deadline", async function () {
      await submitBidForSigner(alice, 50000n);
      await time.increase(86401);
      await expect(tender.evaluateBatch(0, 1))
        .to.emit(tender, "EvaluationBatchCompleted")
        .withArgs(0, 1);
    });

    it("should revert before deadline", async function () {
      await submitBidForSigner(alice, 50000n);
      try {
        await tender.evaluateBatch(0, 1);
        expect.fail("Expected revert");
      } catch (e: any) {
        expect(e.message || e.toString()).to.satisfy(
          (msg: string) => msg.includes("DeadlineNotPassed") || msg.includes("assertion failed")
        );
      }
    });

    it("should revert if start >= end", async function () {
      await submitBidForSigner(alice, 50000n);
      await time.increase(86401);
      await expect(tender.evaluateBatch(1, 1))
        .to.be.revertedWithCustomError(tender, "InvalidRange");
    });

    it("should revert if end exceeds bidders", async function () {
      await submitBidForSigner(alice, 50000n);
      await time.increase(86401);
      await expect(tender.evaluateBatch(0, 5))
        .to.be.revertedWithCustomError(tender, "EndExceedsBidders");
    });

    it("should revert if not evaluating in order", async function () {
      await submitBidForSigner(alice, 50000n);
      await submitBidForSigner(bob, 60000n);
      await time.increase(86401);
      await expect(tender.evaluateBatch(1, 2))
        .to.be.revertedWithCustomError(tender, "MustEvaluateInOrder");
    });

    it("should complete evaluation for all bidders", async function () {
      await submitBidForSigner(alice, 50000n);
      await submitBidForSigner(bob, 40000n);
      await time.increase(86401);
      await expect(tender.evaluateBatch(0, 2))
        .to.emit(tender, "EvaluationCompleted")
        .withArgs(2);
      expect(await tender.evaluationComplete()).to.be.true;
    });

    it("should not allow non-owner to evaluate", async function () {
      await submitBidForSigner(alice, 50000n);
      await time.increase(86401);
      await expect(tender.connect(alice).evaluateBatch(0, 1))
        .to.be.revertedWithCustomError(tender, "OwnableUnauthorizedAccount");
    });
  });

  describe("requestReveal", function () {
    it("should revert if evaluation not complete", async function () {
      await expect(tender.requestReveal())
        .to.be.revertedWithCustomError(tender, "EvaluationNotComplete");
    });
  });

  describe("cancelTender", function () {
    it("should cancel tender", async function () {
      await expect(tender.cancelTender())
        .to.emit(tender, "TenderCancelled");
      expect(await tender.state()).to.equal(5); // Cancelled
    });

    it("should only allow owner", async function () {
      await expect(tender.connect(alice).cancelTender())
        .to.be.revertedWithCustomError(tender, "OwnableUnauthorizedAccount");
    });
  });

  describe("getBidders", function () {
    it("should return empty array if offset >= total", async function () {
      const result = await tender.getBidders(10, 5);
      expect(result.length).to.equal(0);
    });

    it("should return bidders in range", async function () {
      const addr = await tender.getAddress();
      const encPrice = await fhevm.encryptUint(5, 50000n, addr, alice.address);
      const encYears = await fhevm.encryptUint(4, 5n, addr, alice.address);
      const encProjects = await fhevm.encryptUint(4, 10n, addr, alice.address);
      const encBond = await fhevm.encryptUint(5, 10000n, addr, alice.address);
      await tender.connect(alice).submitBid(
        encPrice.externalEuint, encPrice.inputProof,
        encYears.externalEuint, encYears.inputProof,
        encProjects.externalEuint, encProjects.inputProof,
        encBond.externalEuint, encBond.inputProof
      );

      const result = await tender.getBidders(0, 10);
      expect(result.length).to.equal(1);
      expect(result[0]).to.equal(alice.address);
    });
  });

  describe("getConfig", function () {
    it("should return tender config", async function () {
      const config = await tender.getConfig();
      expect(config.description).to.equal("Road Construction");
      expect(config.maxBidders).to.equal(5);
    });
  });

  describe("getBidVersion", function () {
    it("should return 0 for non-bidder", async function () {
      expect(await tender.getBidVersion(alice.address)).to.equal(0);
    });
  });
});
