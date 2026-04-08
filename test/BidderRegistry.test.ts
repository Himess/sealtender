import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { BidderRegistry } from "../typechain-types";

describe("BidderRegistry", function () {
  let registry: BidderRegistry;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, alice, bob, charlie] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BidderRegistry");
    registry = await Factory.deploy(owner.address);
    await registry.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("should start with zero bidders", async function () {
      expect(await registry.bidderCount()).to.equal(0);
    });
  });

  describe("registerBidder", function () {
    it("should register a bidder", async function () {
      await expect(registry.registerBidder(alice.address))
        .to.emit(registry, "BidderRegistered")
        .withArgs(alice.address);
      expect(await registry.isVerified(alice.address)).to.be.true;
    });

    it("should revert on zero address", async function () {
      await expect(registry.registerBidder(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(registry, "ZeroAddress");
    });

    it("should revert if bidder already registered", async function () {
      await registry.registerBidder(alice.address);
      await expect(registry.registerBidder(alice.address))
        .to.be.revertedWithCustomError(registry, "BidderAlreadyRegistered");
    });

    it("should only allow owner to register", async function () {
      await expect(registry.connect(alice).registerBidder(bob.address))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });

    it("should increment bidder count", async function () {
      await registry.registerBidder(alice.address);
      await registry.registerBidder(bob.address);
      expect(await registry.bidderCount()).to.equal(2);
    });
  });

  describe("removeBidder", function () {
    beforeEach(async function () {
      await registry.registerBidder(alice.address);
    });

    it("should remove a bidder", async function () {
      await expect(registry.removeBidder(alice.address))
        .to.emit(registry, "BidderRemoved")
        .withArgs(alice.address);
      expect(await registry.isVerified(alice.address)).to.be.false;
    });

    it("should revert if bidder not registered", async function () {
      await expect(registry.removeBidder(bob.address))
        .to.be.revertedWithCustomError(registry, "BidderNotRegistered");
    });

    it("should decrement bidder count", async function () {
      await registry.removeBidder(alice.address);
      expect(await registry.bidderCount()).to.equal(0);
    });
  });

  describe("addAuthorizedCaller", function () {
    it("should allow owner to add authorized caller", async function () {
      await expect(registry.addAuthorizedCaller(alice.address))
        .to.emit(registry, "AuthorizedCallerAdded")
        .withArgs(alice.address);
      expect(await registry.authorizedCallers(alice.address)).to.be.true;
    });

    it("should revert on zero address", async function () {
      await expect(registry.addAuthorizedCaller(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(registry, "ZeroAddress");
    });

    it("should allow authorized caller to add another authorized caller", async function () {
      await registry.addAuthorizedCaller(alice.address);
      await expect(registry.connect(alice).addAuthorizedCaller(bob.address))
        .to.emit(registry, "AuthorizedCallerAdded")
        .withArgs(bob.address);
    });

    it("should revert if unauthorized tries to add caller", async function () {
      await expect(registry.connect(alice).addAuthorizedCaller(bob.address))
        .to.be.revertedWithCustomError(registry, "CallerNotAuthorized");
    });
  });

  describe("removeAuthorizedCaller", function () {
    it("should allow owner to remove authorized caller", async function () {
      await registry.addAuthorizedCaller(alice.address);
      await expect(registry.removeAuthorizedCaller(alice.address))
        .to.emit(registry, "AuthorizedCallerRemoved")
        .withArgs(alice.address);
      expect(await registry.authorizedCallers(alice.address)).to.be.false;
    });
  });

  describe("Recording functions", function () {
    beforeEach(async function () {
      await registry.registerBidder(alice.address);
      await registry.addAuthorizedCaller(owner.address);
    });

    it("should record bid", async function () {
      await expect(registry.recordBid(alice.address))
        .to.emit(registry, "BidRecorded")
        .withArgs(alice.address);
    });

    it("should record win", async function () {
      await expect(registry.recordWin(alice.address))
        .to.emit(registry, "WinRecorded")
        .withArgs(alice.address);
    });

    it("should record slash", async function () {
      await expect(registry.recordSlash(alice.address))
        .to.emit(registry, "SlashRecorded")
        .withArgs(alice.address);
    });

    it("should record completion", async function () {
      await expect(registry.recordCompletion(alice.address))
        .to.emit(registry, "CompletionRecorded")
        .withArgs(alice.address);
    });

    it("should revert recordBid for unregistered bidder", async function () {
      await expect(registry.recordBid(bob.address))
        .to.be.revertedWithCustomError(registry, "BidderNotRegistered");
    });
  });

  describe("getReputationScore", function () {
    it("should return 0 for unverified bidder", async function () {
      expect(await registry.getReputationScore(bob.address)).to.equal(0);
    });

    it("should return default 50 for new bidder with no activity", async function () {
      await registry.registerBidder(alice.address);
      expect(await registry.getReputationScore(alice.address)).to.equal(50);
    });
  });

  describe("getProfile", function () {
    it("should return correct profile after registration", async function () {
      await registry.registerBidder(alice.address);
      const profile = await registry.getProfile(alice.address);
      expect(profile.verified).to.be.true;
      expect(profile.totalBids).to.equal(0);
    });
  });
});
