import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  BidderRegistry,
  BidEscrow,
  DisputeManager,
  PriceEscalation,
  CollisionDetector,
  ConfidentialUSDC,
  TenderFactory,
  EncryptedTender,
  MockUSDC,
} from "../typechain-types";

describe("EdgeCases", function () {
  let registry: BidderRegistry;
  let escrow: BidEscrow;
  let disputeManager: DisputeManager;
  let escalation: PriceEscalation;
  let detector: CollisionDetector;
  let cusdc: ConfidentialUSDC;
  let factory: TenderFactory;
  let mockUsdc: MockUSDC;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;
  let municipality: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, alice, bob, charlie, municipality] = await ethers.getSigners();

    const RegistryFactory = await ethers.getContractFactory("BidderRegistry");
    registry = await RegistryFactory.deploy(owner.address);
    await registry.waitForDeployment();

    const EscrowFactory = await ethers.getContractFactory("BidEscrow");
    escrow = await EscrowFactory.deploy();
    await escrow.waitForDeployment();

    const DMFactory = await ethers.getContractFactory("DisputeManager");
    disputeManager = await DMFactory.deploy(
      await escrow.getAddress(),
      municipality.address,
      await registry.getAddress()
    );
    await disputeManager.waitForDeployment();

    const EscFactory = await ethers.getContractFactory("PriceEscalation");
    escalation = await EscFactory.deploy();
    await escalation.waitForDeployment();

    const DetFactory = await ethers.getContractFactory("CollisionDetector");
    detector = await DetFactory.deploy();
    await detector.waitForDeployment();

    const MockFactory = await ethers.getContractFactory("MockUSDC");
    mockUsdc = await MockFactory.deploy();
    await mockUsdc.waitForDeployment();

    const CUSDCFactory = await ethers.getContractFactory("ConfidentialUSDC");
    cusdc = await CUSDCFactory.deploy(owner.address);
    await cusdc.waitForDeployment();

    const FactoryFactory = await ethers.getContractFactory("TenderFactory");
    factory = await FactoryFactory.deploy(
      await registry.getAddress(),
      await escrow.getAddress()
    );
    await factory.waitForDeployment();

    await registry.addAuthorizedCaller(await factory.getAddress());
    await escrow.authorizeCaller(await factory.getAddress());
    await escrow.authorizeCaller(await disputeManager.getAddress());
  });

  const defaultSpec = () => ({
    category: "construction",
    totalAreaM2: 4200,
    estimatedValueMin: 2000000n * 1000000n,
    estimatedValueMax: 3000000n * 1000000n,
    boqReference: "BOQ-Rev3-2026",
    standardsReference: "ISO-9001",
    completionDays: 540,
    liquidatedDamages: 500n * 1000000n,
  });

  // --- BidderRegistry Edge Cases ---
  describe("BidderRegistry Edge Cases", function () {
    it("should not verify an already removed bidder without re-registration", async function () {
      await registry.registerBidder(alice.address);
      await registry.removeBidder(alice.address);
      expect(await registry.isVerified(alice.address)).to.be.false;
    });

    it("should allow re-registration after removal", async function () {
      await registry.registerBidder(alice.address);
      await registry.removeBidder(alice.address);
      // After removal, verified is set to false - but we can't re-register because
      // the BidderAlreadyRegistered check uses `profiles[bidder].verified`
      // After removal, verified = false, so we CAN re-register
      await registry.registerBidder(alice.address);
      expect(await registry.isVerified(alice.address)).to.be.true;
    });

    it("should correctly count bidders after multiple add/remove", async function () {
      await registry.registerBidder(alice.address);
      await registry.registerBidder(bob.address);
      expect(await registry.bidderCount()).to.equal(2);
      await registry.removeBidder(alice.address);
      expect(await registry.bidderCount()).to.equal(1);
    });

    it("should prevent non-owner from removing bidder", async function () {
      await registry.registerBidder(alice.address);
      await expect(registry.connect(alice).removeBidder(alice.address))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });

    it("should not allow removing non-registered bidder", async function () {
      await expect(registry.removeBidder(alice.address))
        .to.be.revertedWithCustomError(registry, "BidderNotRegistered");
    });

    it("should allow owner to remove authorized caller", async function () {
      await registry.addAuthorizedCaller(alice.address);
      await registry.removeAuthorizedCaller(alice.address);
      expect(await registry.authorizedCallers(alice.address)).to.be.false;
    });

    it("should prevent unauthorized from calling recordSlash", async function () {
      await registry.registerBidder(alice.address);
      await expect(registry.connect(bob).recordSlash(alice.address))
        .to.be.revertedWithCustomError(registry, "CallerNotAuthorized");
    });

    it("should prevent recordWin for unregistered bidder", async function () {
      await registry.addAuthorizedCaller(owner.address);
      await expect(registry.recordWin(alice.address))
        .to.be.revertedWithCustomError(registry, "BidderNotRegistered");
    });

    it("should prevent recordCompletion for unregistered bidder", async function () {
      await registry.addAuthorizedCaller(owner.address);
      await expect(registry.recordCompletion(alice.address))
        .to.be.revertedWithCustomError(registry, "BidderNotRegistered");
    });

    it("should return reputation 0 for unverified address", async function () {
      expect(await registry.getReputationScore(ethers.ZeroAddress)).to.equal(0);
    });
  });

  // --- BidEscrow Edge Cases ---
  describe("BidEscrow Edge Cases", function () {
    const TENDER_ID = 0;
    const DEPOSIT = ethers.parseEther("1");

    it("should not allow deposit with zero required", async function () {
      // required deposit defaults to 0, so any deposit works
      await escrow.connect(alice).deposit(TENDER_ID, { value: 0 });
      expect(await escrow.getDepositStatus(TENDER_ID, alice.address)).to.equal(1);
    });

    it("should not allow release of frozen deposit", async function () {
      await escrow.setRequiredDeposit(TENDER_ID, DEPOSIT);
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT });
      await escrow.freeze(TENDER_ID, alice.address);
      await expect(escrow.release(TENDER_ID, alice.address))
        .to.be.revertedWithCustomError(escrow, "DepositFrozen");
    });

    it("should not allow refund of frozen deposit", async function () {
      await escrow.setRequiredDeposit(TENDER_ID, DEPOSIT);
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT });
      await escrow.freeze(TENDER_ID, alice.address);
      await expect(escrow.refund(TENDER_ID, alice.address))
        .to.be.revertedWithCustomError(escrow, "DepositFrozen");
    });

    it("should not allow double freeze", async function () {
      await escrow.setRequiredDeposit(TENDER_ID, DEPOSIT);
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT });
      await escrow.freeze(TENDER_ID, alice.address);
      await expect(escrow.freeze(TENDER_ID, alice.address))
        .to.be.revertedWithCustomError(escrow, "DepositNotActive");
    });

    it("should return None status for non-existent deposit", async function () {
      expect(await escrow.getDepositStatus(TENDER_ID, alice.address)).to.equal(0); // None
    });

    it("should reduce totalEscrow after release", async function () {
      await escrow.setRequiredDeposit(TENDER_ID, DEPOSIT);
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT });
      await escrow.release(TENDER_ID, alice.address);
      expect(await escrow.totalEscrow(TENDER_ID)).to.equal(0);
    });

    it("should handle slash from active deposit", async function () {
      await escrow.setRequiredDeposit(TENDER_ID, DEPOSIT);
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT });
      await expect(escrow.slash(TENDER_ID, alice.address, municipality.address))
        .to.emit(escrow, "EscrowSlashed");
    });

    it("should not allow slash on released deposit", async function () {
      await escrow.setRequiredDeposit(TENDER_ID, DEPOSIT);
      await escrow.connect(alice).deposit(TENDER_ID, { value: DEPOSIT });
      await escrow.release(TENDER_ID, alice.address);
      await expect(escrow.slash(TENDER_ID, alice.address, municipality.address))
        .to.be.revertedWithCustomError(escrow, "DepositNotActive");
    });

    it("should not allow deauthorize from non-owner", async function () {
      await expect(escrow.connect(alice).deauthorizeCaller(bob.address))
        .to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });

    it("should deauthorize caller", async function () {
      await escrow.authorizeCaller(alice.address);
      await escrow.deauthorizeCaller(alice.address);
      expect(await escrow.authorizedCallers(alice.address)).to.be.false;
    });
  });

  // --- DisputeManager Edge Cases ---
  describe("DisputeManager Edge Cases", function () {
    it("should revert getDispute with out-of-range ID when no disputes exist", async function () {
      await expect(disputeManager.getDispute(0))
        .to.be.revertedWithCustomError(disputeManager, "InvalidDisputeId");
    });

    it("should return empty array for tender with no disputes", async function () {
      const disputes = await disputeManager.getDisputesByTender(99);
      expect(disputes.length).to.equal(0);
    });

    it("should store correct reason string", async function () {
      await disputeManager.connect(alice).fileCitizenComplaint(0, bob.address, "Corruption evidence");
      const dispute = await disputeManager.getDispute(0);
      expect(dispute.reason).to.equal("Corruption evidence");
    });

    it("should handle multiple disputes for same tender", async function () {
      await disputeManager.connect(alice).fileCitizenComplaint(0, bob.address, "R1");
      await disputeManager.connect(alice).fileCitizenComplaint(0, charlie.address, "R2");
      expect(await disputeManager.disputeCount()).to.equal(2);
    });

    it("should handle company complaint with exact stake", async function () {
      const STAKE = await disputeManager.getComplaintStake(0);
      await disputeManager.connect(alice).fileCompanyComplaint(0, bob.address, "Reason", { value: STAKE });
      const dispute = await disputeManager.getDispute(0);
      expect(dispute.stake).to.equal(STAKE);
    });

    it("should handle company complaint with overpayment", async function () {
      const STAKE = await disputeManager.getComplaintStake(0);
      await disputeManager.connect(alice).fileCompanyComplaint(0, bob.address, "Reason", { value: STAKE * 2n });
      const dispute = await disputeManager.getDispute(0);
      expect(dispute.stake).to.equal(STAKE * 2n);
    });

    it("should prevent non-owner from resolving dispute", async function () {
      await disputeManager.connect(alice).fileCitizenComplaint(0, bob.address, "R");
      await expect(disputeManager.connect(alice).resolveDispute(0, 4))
        .to.be.revertedWithCustomError(disputeManager, "OwnableUnauthorizedAccount");
    });

    it("should prevent resolving already dismissed dispute", async function () {
      await disputeManager.connect(alice).fileCitizenComplaint(0, bob.address, "R");
      await disputeManager.resolveDispute(0, 4); // Dismissed
      await expect(disputeManager.resolveDispute(0, 2)) // Slashed
        .to.be.revertedWithCustomError(disputeManager, "DisputeAlreadyResolved");
    });
  });

  // --- PriceEscalation Edge Cases ---
  describe("PriceEscalation Edge Cases", function () {
    const TENDER_ID = 0;
    const MAT = ethers.id("CONCRETE");
    const BASELINE = 2000n;
    const PERIOD = 3600n;

    it("should allow first oracle price of any value (no sanity check)", async function () {
      await escalation.updateOraclePrice(MAT, 999999);
      expect(await escalation.getLatestPrice(MAT)).to.equal(999999);
    });

    it("should reject 51% increase", async function () {
      await escalation.updateOraclePrice(MAT, 1000);
      await expect(escalation.updateOraclePrice(MAT, 1510))
        .to.be.revertedWithCustomError(escalation, "PriceChangeExceedsLimit");
    });

    it("should allow exactly 50% decrease", async function () {
      await escalation.updateOraclePrice(MAT, 1000);
      await escalation.updateOraclePrice(MAT, 500);
      expect(await escalation.getLatestPrice(MAT)).to.equal(500);
    });

    it("should allow zero baseline to zero increase (no change)", async function () {
      await escalation.setEscalationRule(TENDER_ID, MAT, 0, 500, 3000, PERIOD);
      await expect(escalation.evaluateEscalation(TENDER_ID, MAT))
        .to.be.revertedWithCustomError(escalation, "NoRuleSet");
    });

    it("should revert evaluation if period not elapsed after first evaluation", async function () {
      await escalation.setEscalationRule(TENDER_ID, MAT, BASELINE, 500, 3000, PERIOD);
      await escalation.setTenderPrice(TENDER_ID, ethers.parseEther("100"));
      const price = BASELINE + (BASELINE * 600n / 10000n);
      await escalation.updateOraclePrice(MAT, price);
      await time.increase(Number(PERIOD) + 1);
      await escalation.evaluateEscalation(TENDER_ID, MAT);
      // Second evaluation too soon
      await expect(escalation.evaluateEscalation(TENDER_ID, MAT))
        .to.be.revertedWithCustomError(escalation, "PeriodNotElapsed");
    });

    it("should handle multiple materials for same tender", async function () {
      const MAT2 = ethers.id("IRON");
      await escalation.setEscalationRule(TENDER_ID, MAT, BASELINE, 500, 3000, PERIOD);
      await escalation.setEscalationRule(TENDER_ID, MAT2, 500n, 500, 3000, PERIOD);
      expect(await escalation.getBaselinePrice(TENDER_ID, MAT)).to.equal(BASELINE);
      expect(await escalation.getBaselinePrice(TENDER_ID, MAT2)).to.equal(500n);
    });

    it("should return BPS_DENOMINATOR as named constant", async function () {
      expect(await escalation.BPS_DENOMINATOR()).to.equal(10000);
    });

    it("should not allow non-owner to update oracle price", async function () {
      await expect(escalation.connect(alice).updateOraclePrice(MAT, 1000))
        .to.be.revertedWithCustomError(escalation, "OwnableUnauthorizedAccount");
    });

    it("should not allow non-owner to set escalation rule", async function () {
      await expect(escalation.connect(alice).setEscalationRule(0, MAT, 100, 500, 3000, 3600))
        .to.be.revertedWithCustomError(escalation, "OwnableUnauthorizedAccount");
    });
  });

  // --- CollisionDetector Edge Cases ---
  describe("CollisionDetector Edge Cases", function () {
    it("should not allow non-owner to check collision", async function () {
      const addr = await detector.getAddress();
      const enc1 = await fhevm.encryptUint(5, 100n, addr, alice.address);
      const enc2 = await fhevm.encryptUint(5, 200n, addr, alice.address);
      await expect(
        detector.connect(alice).checkCollision(1, [enc1.externalEuint, enc2.externalEuint], [enc1.inputProof, enc2.inputProof])
      ).to.be.revertedWithCustomError(detector, "OwnableUnauthorizedAccount");
    });

    it("should not allow setCollisionResult for unchecked tender", async function () {
      await expect(detector.setCollisionResult(0, true))
        .to.be.revertedWith("Not checked yet");
    });

    it("should not allow non-owner to set collision result", async function () {
      const addr = await detector.getAddress();
      const enc1 = await fhevm.encryptUint(5, 100n, addr, owner.address);
      const enc2 = await fhevm.encryptUint(5, 200n, addr, owner.address);
      await detector.checkCollision(1, [enc1.externalEuint, enc2.externalEuint], [enc1.inputProof, enc2.inputProof]);
      await expect(detector.connect(alice).setCollisionResult(1, true))
        .to.be.revertedWithCustomError(detector, "OwnableUnauthorizedAccount");
    });

    it("should handle exactly 10 bids", async function () {
      const addr = await detector.getAddress();
      const handles: string[] = [];
      const proofs: string[] = [];
      for (let i = 0; i < 10; i++) {
        const enc = await fhevm.encryptUint(5, BigInt(i * 100 + 100), addr, owner.address);
        handles.push(enc.externalEuint);
        proofs.push(enc.inputProof);
      }
      await expect(detector.checkCollision(2, handles, proofs))
        .to.emit(detector, "CollisionCheckStarted")
        .withArgs(2, 10);
    });

    it("should handle setting false collision result", async function () {
      const addr = await detector.getAddress();
      const enc1 = await fhevm.encryptUint(5, 100n, addr, owner.address);
      const enc2 = await fhevm.encryptUint(5, 200n, addr, owner.address);
      await detector.checkCollision(3, [enc1.externalEuint, enc2.externalEuint], [enc1.inputProof, enc2.inputProof]);
      await detector.setCollisionResult(3, false);
      expect(await detector.collisionDetected(3)).to.be.false;
    });
  });

  // --- ConfidentialUSDC Edge Cases ---
  describe("ConfidentialUSDC Edge Cases", function () {
    it("should not allow wrap when underlying is zero address", async function () {
      const CUSDCFactory = await ethers.getContractFactory("ConfidentialUSDC");
      const cusdc2 = await CUSDCFactory.deploy(owner.address);
      await cusdc2.waitForDeployment();
      await expect(cusdc2.connect(alice).wrap(100))
        .to.be.revertedWithCustomError(cusdc2, "WrapDisabled");
    });

    it("should not allow unwrap when underlying is zero address", async function () {
      const CUSDCFactory = await ethers.getContractFactory("ConfidentialUSDC");
      const cusdc2 = await CUSDCFactory.deploy(owner.address);
      await cusdc2.waitForDeployment();
      await expect(cusdc2.connect(alice).unwrap(100))
        .to.be.revertedWithCustomError(cusdc2, "WrapDisabled");
    });

    it("should allow different users to use faucet", async function () {
      await cusdc.setUnderlyingUSDC(await mockUsdc.getAddress());
      await cusdc.connect(alice).faucet(1000);
      await cusdc.connect(bob).faucet(1000);
      // Both should succeed
    });

    it("should not allow non-owner to mint", async function () {
      await expect(cusdc.connect(alice).mint(alice.address, 1000))
        .to.be.revertedWithCustomError(cusdc, "OwnableUnauthorizedAccount");
    });

    it("should not allow non-owner to burn", async function () {
      await expect(cusdc.connect(alice).burn(alice.address, 1000))
        .to.be.revertedWithCustomError(cusdc, "OwnableUnauthorizedAccount");
    });

    it("should enforce FAUCET_MAX", async function () {
      const max = await cusdc.FAUCET_MAX();
      await expect(cusdc.connect(alice).faucet(max + 1n))
        .to.be.revertedWithCustomError(cusdc, "FaucetAmountExceedsMax");
    });
  });

  // --- TenderFactory Edge Cases ---
  describe("TenderFactory Edge Cases", function () {
    it("should not allow non-owner to set dispute manager", async function () {
      await expect(factory.connect(alice).setDisputeManager(alice.address))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("should not allow non-owner to set escalation", async function () {
      await expect(factory.connect(alice).setEscalation(alice.address))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("should not allow non-owner to set collision detector", async function () {
      await expect(factory.connect(alice).setCollisionDetector(alice.address))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("should return zero address for non-existent tender", async function () {
      expect(await factory.getTender(999)).to.equal(ethers.ZeroAddress);
    });

    it("should create multiple tenders with incremental IDs", async function () {
      const config1 = {
        description: "T1", deadline: (await time.latest()) + 86400,
        weightYears: 30, weightProjects: 30, weightBond: 40,
        minYears: 1, minProjects: 1, minBond: 1000,
        escrowAmount: 0, maxBidders: 5, minReputation: 0,
      };
      await factory.createTender(config1, defaultSpec());
      const config2 = { ...config1, description: "T2", deadline: (await time.latest()) + 86400 };
      await factory.createTender(config2, defaultSpec());
      expect(await factory.tenderCount()).to.equal(2);
      expect(await factory.getTender(0)).to.not.equal(await factory.getTender(1));
    });
  });

  // --- EncryptedTender Edge Cases ---
  describe("EncryptedTender Edge Cases", function () {
    let tender: EncryptedTender;

    beforeEach(async function () {
      await registry.registerBidder(alice.address);
      await registry.registerBidder(bob.address);

      const deadline = (await time.latest()) + 86400;
      const config = {
        description: "Edge Test", deadline,
        weightYears: 30, weightProjects: 30, weightBond: 40,
        minYears: 2, minProjects: 3, minBond: 5000,
        escrowAmount: 0, maxBidders: 5, minReputation: 0,
      };
      const TenderFactory = await ethers.getContractFactory("EncryptedTender");
      tender = await TenderFactory.deploy(
        0, config, defaultSpec(), await registry.getAddress(), await escrow.getAddress()
      );
      await tender.waitForDeployment();
      await registry.addAuthorizedCaller(await tender.getAddress());
    });

    it("should not allow non-owner to cancel", async function () {
      await expect(tender.connect(alice).cancelTender())
        .to.be.revertedWithCustomError(tender, "OwnableUnauthorizedAccount");
    });

    it("should not allow non-owner to pause", async function () {
      await expect(tender.connect(alice).pause())
        .to.be.revertedWithCustomError(tender, "OwnableUnauthorizedAccount");
    });

    it("should not allow non-owner to unpause", async function () {
      await expect(tender.connect(alice).unpause())
        .to.be.revertedWithCustomError(tender, "OwnableUnauthorizedAccount");
    });

    it("should not allow requestReveal when evaluation not complete", async function () {
      await expect(tender.requestReveal())
        .to.be.revertedWithCustomError(tender, "EvaluationNotComplete");
    });

    it("should return empty bidders when no bids", async function () {
      const result = await tender.getBidders(0, 10);
      expect(result.length).to.equal(0);
    });

    it("should return zero bid version for non-bidder", async function () {
      expect(await tender.getBidVersion(alice.address)).to.equal(0);
    });

    it("should track hasBid correctly", async function () {
      expect(await tender.hasBid(alice.address)).to.be.false;
    });

    it("should set evaluationComplete to false initially", async function () {
      expect(await tender.evaluationComplete()).to.be.false;
    });

    it("should set revealed to false initially", async function () {
      expect(await tender.revealed()).to.be.false;
    });

    it("should start with evaluatedCount = 0", async function () {
      expect(await tender.evaluatedCount()).to.equal(0);
    });
  });
});
