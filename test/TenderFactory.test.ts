import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { TenderFactory, BidderRegistry, BidEscrow } from "../typechain-types";

describe("TenderFactory", function () {
  let factory: TenderFactory;
  let registry: BidderRegistry;
  let escrow: BidEscrow;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  const makeConfig = async (overrides: any = {}) => ({
    description: "Test Tender",
    deadline: (await time.latest()) + 86400,
    weightYears: 30,
    weightProjects: 30,
    weightBond: 40,
    minYears: 2,
    minProjects: 3,
    minBond: 5000,
    escrowAmount: 0,
    maxBidders: 5,
    minReputation: 0,
    ...overrides,
  });

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

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

    // Authorize factory in registry and escrow
    await registry.addAuthorizedCaller(await factory.getAddress());
    await escrow.authorizeCaller(await factory.getAddress());
  });

  describe("Deployment", function () {
    it("should set correct owner", async function () {
      expect(await factory.owner()).to.equal(owner.address);
    });

    it("should set correct registry", async function () {
      expect(await factory.registry()).to.equal(await registry.getAddress());
    });

    it("should set correct escrow", async function () {
      expect(await factory.escrow()).to.equal(await escrow.getAddress());
    });

    it("should start with zero tenders", async function () {
      expect(await factory.tenderCount()).to.equal(0);
    });

    it("should revert with zero registry address", async function () {
      const FactoryFactory = await ethers.getContractFactory("TenderFactory");
      await expect(
        FactoryFactory.deploy(ethers.ZeroAddress, await escrow.getAddress())
      ).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });

    it("should revert with zero escrow address", async function () {
      const FactoryFactory = await ethers.getContractFactory("TenderFactory");
      await expect(
        FactoryFactory.deploy(await registry.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });
  });

  describe("createTender", function () {
    it("should create a tender", async function () {
      const config = await makeConfig();
      await expect(factory.createTender(config))
        .to.emit(factory, "TenderCreated");
    });

    it("should increment tender count", async function () {
      const config = await makeConfig();
      await factory.createTender(config);
      expect(await factory.tenderCount()).to.equal(1);
    });

    it("should store tender address", async function () {
      const config = await makeConfig();
      await factory.createTender(config);
      const addr = await factory.getTender(0);
      expect(addr).to.not.equal(ethers.ZeroAddress);
    });

    it("should auto-authorize tender in registry", async function () {
      const config = await makeConfig();
      await factory.createTender(config);
      const addr = await factory.getTender(0);
      expect(await registry.authorizedCallers(addr)).to.be.true;
    });

    it("should revert with past deadline", async function () {
      const config = await makeConfig({ deadline: (await time.latest()) - 1 });
      await expect(factory.createTender(config))
        .to.be.revertedWith("Deadline must be future");
    });

    it("should revert with zero maxBidders", async function () {
      const config = await makeConfig({ maxBidders: 0 });
      await expect(factory.createTender(config))
        .to.be.revertedWith("Must allow at least 1 bidder");
    });

    it("should only allow owner to create", async function () {
      const config = await makeConfig();
      await expect(factory.connect(alice).createTender(config))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });

  describe("setDisputeManager", function () {
    it("should emit DisputeManagerSet event", async function () {
      await expect(factory.setDisputeManager(alice.address))
        .to.emit(factory, "DisputeManagerSet")
        .withArgs(alice.address);
    });

    it("should store dispute manager", async function () {
      await factory.setDisputeManager(alice.address);
      expect(await factory.disputeManager()).to.equal(alice.address);
    });

    it("should revert on zero address", async function () {
      await expect(factory.setDisputeManager(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "ZeroAddress");
    });
  });

  describe("setEscalation", function () {
    it("should emit EscalationSet event", async function () {
      await expect(factory.setEscalation(alice.address))
        .to.emit(factory, "EscalationSet")
        .withArgs(alice.address);
    });

    it("should revert on zero address", async function () {
      await expect(factory.setEscalation(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "ZeroAddress");
    });
  });

  describe("setCollisionDetector", function () {
    it("should emit CollisionDetectorSet event", async function () {
      await expect(factory.setCollisionDetector(alice.address))
        .to.emit(factory, "CollisionDetectorSet")
        .withArgs(alice.address);
    });

    it("should revert on zero address", async function () {
      await expect(factory.setCollisionDetector(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "ZeroAddress");
    });
  });

  describe("getTenders (pagination)", function () {
    it("should return empty array for offset >= count", async function () {
      const result = await factory.getTenders(10, 5);
      expect(result.length).to.equal(0);
    });

    it("should return tenders in range", async function () {
      const config = await makeConfig();
      await factory.createTender(config);
      const config2 = await makeConfig({ description: "Second" });
      await factory.createTender(config2);

      const result = await factory.getTenders(0, 10);
      expect(result.length).to.equal(2);
    });

    it("should clamp end to tenderCount", async function () {
      const config = await makeConfig();
      await factory.createTender(config);
      const result = await factory.getTenders(0, 100);
      expect(result.length).to.equal(1);
    });
  });

  describe("getAllTenders", function () {
    it("should return all tenders", async function () {
      const config = await makeConfig();
      await factory.createTender(config);
      const all = await factory.getAllTenders();
      expect(all.length).to.equal(1);
    });
  });
});
