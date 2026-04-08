import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  BidderRegistry,
  BidEscrow,
  TenderFactory,
  EncryptedTender,
  CollisionDetector,
  PriceEscalation,
  DisputeManager,
} from "../typechain-types";

describe("GasBenchmark", function () {
  let registry: BidderRegistry;
  let escrow: BidEscrow;
  let factory: TenderFactory;
  let detector: CollisionDetector;
  let escalation: PriceEscalation;
  let disputeManager: DisputeManager;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let municipality: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, alice, bob, municipality] = await ethers.getSigners();

    const RegistryFactory = await ethers.getContractFactory("BidderRegistry");
    registry = await RegistryFactory.deploy(owner.address);
    await registry.waitForDeployment();

    const EscrowFactory = await ethers.getContractFactory("BidEscrow");
    escrow = await EscrowFactory.deploy();
    await escrow.waitForDeployment();

    const FactoryFactory = await ethers.getContractFactory("TenderFactory");
    factory = await FactoryFactory.deploy(
      await registry.getAddress(),
      await escrow.getAddress()
    );
    await factory.waitForDeployment();

    const DetFactory = await ethers.getContractFactory("CollisionDetector");
    detector = await DetFactory.deploy();
    await detector.waitForDeployment();

    const EscFactory = await ethers.getContractFactory("PriceEscalation");
    escalation = await EscFactory.deploy();
    await escalation.waitForDeployment();

    const DMFactory = await ethers.getContractFactory("DisputeManager");
    disputeManager = await DMFactory.deploy(
      await escrow.getAddress(),
      municipality.address,
      await registry.getAddress()
    );
    await disputeManager.waitForDeployment();

    await registry.addAuthorizedCaller(await factory.getAddress());
    await escrow.authorizeCaller(await factory.getAddress());
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

  it("should benchmark registerBidder gas", async function () {
    const tx = await registry.registerBidder(alice.address);
    const receipt = await tx.wait();
    console.log(`    registerBidder gas: ${receipt!.gasUsed.toString()}`);
    expect(receipt!.gasUsed).to.be.gt(0);
  });

  it("should benchmark createTender gas", async function () {
    const config = {
      description: "Gas Test Tender",
      deadline: (await time.latest()) + 86400,
      weightYears: 30, weightProjects: 30, weightBond: 40,
      minYears: 2, minProjects: 3, minBond: 5000,
      escrowAmount: 0, maxBidders: 5, minReputation: 0,
    };
    const tx = await factory.createTender(config, defaultSpec());
    const receipt = await tx.wait();
    console.log(`    createTender gas: ${receipt!.gasUsed.toString()}`);
    expect(receipt!.gasUsed).to.be.gt(0);
  });

  it("should benchmark submitBid gas", async function () {
    await registry.registerBidder(alice.address);
    const config = {
      description: "Gas Tender",
      deadline: (await time.latest()) + 86400,
      weightYears: 30, weightProjects: 30, weightBond: 40,
      minYears: 2, minProjects: 3, minBond: 5000,
      escrowAmount: 0, maxBidders: 5, minReputation: 0,
    };
    const TenderFactory = await ethers.getContractFactory("EncryptedTender");
    const tender = await TenderFactory.deploy(
      0, config, defaultSpec(), await registry.getAddress(), await escrow.getAddress()
    );
    await tender.waitForDeployment();
    await registry.addAuthorizedCaller(await tender.getAddress());

    const addr = await tender.getAddress();
    const encPrice = await fhevm.encryptUint(5, 50000n, addr, alice.address);
    const encYears = await fhevm.encryptUint(4, 5n, addr, alice.address);
    const encProjects = await fhevm.encryptUint(4, 10n, addr, alice.address);
    const encBond = await fhevm.encryptUint(5, 10000n, addr, alice.address);

    const tx = await tender.connect(alice).submitBid(
      encPrice.externalEuint, encPrice.inputProof,
      encYears.externalEuint, encYears.inputProof,
      encProjects.externalEuint, encProjects.inputProof,
      encBond.externalEuint, encBond.inputProof
    );
    const receipt = await tx.wait();
    console.log(`    submitBid gas: ${receipt!.gasUsed.toString()}`);
    expect(receipt!.gasUsed).to.be.gt(0);
  });

  it("should benchmark deposit gas", async function () {
    const DEPOSIT = ethers.parseEther("1");
    await escrow.setRequiredDeposit(0, DEPOSIT);
    const tx = await escrow.connect(alice).deposit(0, { value: DEPOSIT });
    const receipt = await tx.wait();
    console.log(`    deposit gas: ${receipt!.gasUsed.toString()}`);
    expect(receipt!.gasUsed).to.be.gt(0);
  });

  it("should benchmark fileCompanyComplaint gas", async function () {
    const STAKE = await disputeManager.getComplaintStake(0);
    const tx = await disputeManager.connect(alice).fileCompanyComplaint(
      0, bob.address, "Test complaint", { value: STAKE }
    );
    const receipt = await tx.wait();
    console.log(`    fileCompanyComplaint gas: ${receipt!.gasUsed.toString()}`);
    expect(receipt!.gasUsed).to.be.gt(0);
  });

  it("should benchmark collision check gas (2 bids)", async function () {
    const addr = await detector.getAddress();
    const enc1 = await fhevm.encryptUint(5, 100n, addr, owner.address);
    const enc2 = await fhevm.encryptUint(5, 200n, addr, owner.address);
    const tx = await detector.checkCollision(
      1, [enc1.externalEuint, enc2.externalEuint], [enc1.inputProof, enc2.inputProof]
    );
    const receipt = await tx.wait();
    console.log(`    checkCollision (2 bids) gas: ${receipt!.gasUsed.toString()}`);
    expect(receipt!.gasUsed).to.be.gt(0);
  });

  it("should benchmark oracle price update gas", async function () {
    const MAT = ethers.id("STEEL");
    const tx = await escalation.updateOraclePrice(MAT, 1000);
    const receipt = await tx.wait();
    console.log(`    updateOraclePrice gas: ${receipt!.gasUsed.toString()}`);
    expect(receipt!.gasUsed).to.be.gt(0);
  });
});
