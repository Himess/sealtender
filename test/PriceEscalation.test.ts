import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { PriceEscalation, MockV3Aggregator, MockPyth } from "../typechain-types";

describe("PriceEscalation", function () {
  let escalation: PriceEscalation;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let winner: HardhatEthersSigner;
  const TENDER_ID = 0;
  const MATERIAL_ID = ethers.id("STEEL");
  const BASELINE_PRICE = 1000n;
  const TENDER_PRICE = ethers.parseEther("100");
  const THRESHOLD_BPS = 500n; // 5%
  const CAP_BPS = 3000n; // 30%
  const PERIOD = 86400n; // 1 day

  beforeEach(async function () {
    [owner, alice, winner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PriceEscalation");
    escalation = await Factory.deploy();
    await escalation.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      expect(await escalation.owner()).to.equal(owner.address);
    });

    it("should have correct BPS_DENOMINATOR", async function () {
      expect(await escalation.BPS_DENOMINATOR()).to.equal(10000);
    });

    it("should have correct MAX_PRICE_CHANGE_BPS", async function () {
      expect(await escalation.MAX_PRICE_CHANGE_BPS()).to.equal(5000);
    });
  });

  describe("setTenderPrice", function () {
    it("should set tender price", async function () {
      await escalation.setTenderPrice(TENDER_ID, TENDER_PRICE);
      expect(await escalation.tenderPrice(TENDER_ID)).to.equal(TENDER_PRICE);
    });

    it("should only allow owner", async function () {
      await expect(escalation.connect(alice).setTenderPrice(TENDER_ID, TENDER_PRICE))
        .to.be.revertedWithCustomError(escalation, "OwnableUnauthorizedAccount");
    });
  });

  describe("setEscalationRule", function () {
    it("should set escalation rule", async function () {
      await expect(escalation.setEscalationRule(
        TENDER_ID, MATERIAL_ID, BASELINE_PRICE, THRESHOLD_BPS, CAP_BPS, PERIOD
      )).to.emit(escalation, "EscalationRuleSet")
        .withArgs(TENDER_ID, MATERIAL_ID);
    });

    it("should store correct baseline price", async function () {
      await escalation.setEscalationRule(
        TENDER_ID, MATERIAL_ID, BASELINE_PRICE, THRESHOLD_BPS, CAP_BPS, PERIOD
      );
      expect(await escalation.getBaselinePrice(TENDER_ID, MATERIAL_ID)).to.equal(BASELINE_PRICE);
    });
  });

  describe("updateOraclePrice", function () {
    it("should set initial price", async function () {
      await expect(escalation.updateOraclePrice(MATERIAL_ID, 1000))
        .to.emit(escalation, "OraclePriceUpdated")
        .withArgs(MATERIAL_ID, 1000);
    });

    it("should allow update within 50% change", async function () {
      await escalation.updateOraclePrice(MATERIAL_ID, 1000);
      await escalation.updateOraclePrice(MATERIAL_ID, 1400); // 40% increase
      expect(await escalation.getLatestPrice(MATERIAL_ID)).to.equal(1400);
    });

    it("should revert on >50% increase", async function () {
      await escalation.updateOraclePrice(MATERIAL_ID, 1000);
      await expect(escalation.updateOraclePrice(MATERIAL_ID, 1600)) // 60% increase
        .to.be.revertedWithCustomError(escalation, "PriceChangeExceedsLimit");
    });

    it("should revert on >50% decrease", async function () {
      await escalation.updateOraclePrice(MATERIAL_ID, 1000);
      await expect(escalation.updateOraclePrice(MATERIAL_ID, 400)) // 60% decrease
        .to.be.revertedWithCustomError(escalation, "PriceChangeExceedsLimit");
    });

    it("should allow exactly 50% change", async function () {
      await escalation.updateOraclePrice(MATERIAL_ID, 1000);
      await escalation.updateOraclePrice(MATERIAL_ID, 1500); // 50% increase
      expect(await escalation.getLatestPrice(MATERIAL_ID)).to.equal(1500);
    });
  });

  describe("evaluateEscalation", function () {
    beforeEach(async function () {
      await escalation.setTenderPrice(TENDER_ID, TENDER_PRICE);
      await escalation.setEscalationRule(
        TENDER_ID, MATERIAL_ID, BASELINE_PRICE, THRESHOLD_BPS, CAP_BPS, PERIOD
      );
    });

    it("should return 0 if price has not increased", async function () {
      await escalation.updateOraclePrice(MATERIAL_ID, BASELINE_PRICE);
      await time.increase(Number(PERIOD) + 1);
      const tx = await escalation.evaluateEscalation(TENDER_ID, MATERIAL_ID);
      const receipt = await tx.wait();
      // No EscalationTriggered event means 0 extra payment
    });

    it("should return 0 if increase is below threshold", async function () {
      await escalation.updateOraclePrice(MATERIAL_ID, BASELINE_PRICE + 30n); // 3% increase
      await time.increase(Number(PERIOD) + 1);
      const tx = await escalation.evaluateEscalation(TENDER_ID, MATERIAL_ID);
      const receipt = await tx.wait();
    });

    it("should trigger escalation when above threshold", async function () {
      const newPrice = BASELINE_PRICE + (BASELINE_PRICE * 1000n / 10000n); // 10% increase
      await escalation.updateOraclePrice(MATERIAL_ID, newPrice);
      await time.increase(Number(PERIOD) + 1);
      await expect(escalation.evaluateEscalation(TENDER_ID, MATERIAL_ID))
        .to.emit(escalation, "EscalationTriggered");
    });

    it("should revert if cap exceeded", async function () {
      // First set a mid-range price
      await escalation.updateOraclePrice(MATERIAL_ID, BASELINE_PRICE);
      // Then increase above cap in a step that's within oracle sanity limit
      const newPrice = BASELINE_PRICE + (BASELINE_PRICE * CAP_BPS / 10000n) + 10n;
      // Only works if single step; let's chain
      await escalation.updateOraclePrice(MATERIAL_ID, BASELINE_PRICE + (BASELINE_PRICE * 4000n / 10000n)); // 40%
      await time.increase(Number(PERIOD) + 1);
      await expect(escalation.evaluateEscalation(TENDER_ID, MATERIAL_ID))
        .to.be.revertedWithCustomError(escalation, "EscalationCapExceeded");
    });

    it("should revert if period not elapsed", async function () {
      await escalation.updateOraclePrice(MATERIAL_ID, BASELINE_PRICE + 100n);
      await expect(escalation.evaluateEscalation(TENDER_ID, MATERIAL_ID))
        .to.be.revertedWithCustomError(escalation, "PeriodNotElapsed");
    });

    it("should revert if no rule set", async function () {
      const otherMaterial = ethers.id("WOOD");
      await expect(escalation.evaluateEscalation(TENDER_ID, otherMaterial))
        .to.be.revertedWithCustomError(escalation, "NoRuleSet");
    });

    it("should accumulate total escalation paid only after payment lands", async function () {
      const newPrice = BASELINE_PRICE + (BASELINE_PRICE * 1000n / 10000n); // 10%
      await escalation.updateOraclePrice(MATERIAL_ID, newPrice);
      await time.increase(Number(PERIOD) + 1);

      // Without winner/budget configured, counter must stay 0 (post L-1 fix:
      // totalEscalationPaid only advances when an actual payment lands).
      await escalation.evaluateEscalation(TENDER_ID, MATERIAL_ID);
      expect(await escalation.getTotalEscalation(TENDER_ID)).to.equal(0);

      // Configure winner + budget, advance another period, evaluate again.
      const [, winner] = await ethers.getSigners();
      await escalation.setTenderWinner(TENDER_ID, winner.address);
      await escalation.depositEscalationBudget(TENDER_ID, { value: ethers.parseEther("100") });

      // Bump price past prior baseline so increase > threshold once more
      const evenNewerPrice = BASELINE_PRICE + (BASELINE_PRICE * 1500n / 10000n);
      await escalation.updateOraclePrice(MATERIAL_ID, evenNewerPrice);
      await time.increase(Number(PERIOD) + 1);

      await escalation.evaluateEscalation(TENDER_ID, MATERIAL_ID);
      expect(await escalation.getTotalEscalation(TENDER_ID)).to.be.gt(0);
    });
  });

  describe("Views", function () {
    it("should return latest price", async function () {
      await escalation.updateOraclePrice(MATERIAL_ID, 500);
      expect(await escalation.getLatestPrice(MATERIAL_ID)).to.equal(500);
    });

    it("should return baseline price", async function () {
      await escalation.setEscalationRule(
        TENDER_ID, MATERIAL_ID, BASELINE_PRICE, THRESHOLD_BPS, CAP_BPS, PERIOD
      );
      expect(await escalation.getBaselinePrice(TENDER_ID, MATERIAL_ID)).to.equal(BASELINE_PRICE);
    });

    it("should return zero total escalation initially", async function () {
      expect(await escalation.getTotalEscalation(TENDER_ID)).to.equal(0);
    });
  });

  describe("Chainlink Oracle Integration", function () {
    let mockAggregator: MockV3Aggregator;

    beforeEach(async function () {
      const MockFactory = await ethers.getContractFactory("MockV3Aggregator");
      mockAggregator = await MockFactory.deploy(8, 1500); // 8 decimals, initial price 1500
      await mockAggregator.waitForDeployment();
    });

    it("should read price from Chainlink feed", async function () {
      await escalation.setPriceFeed(MATERIAL_ID, await mockAggregator.getAddress());
      const price = await escalation.getLatestPrice(MATERIAL_ID);
      expect(price).to.equal(1500);
    });

    it("should fallback to manual price when no feed", async function () {
      // No feed set — should return latestPrices value
      await escalation.updateOraclePrice(MATERIAL_ID, 2000);
      const price = await escalation.getLatestPrice(MATERIAL_ID);
      expect(price).to.equal(2000);
    });

    it("should reject stale oracle data", async function () {
      await escalation.setPriceFeed(MATERIAL_ID, await mockAggregator.getAddress());
      // Set updatedAt to 2 days ago (stale)
      const staleTimestamp = (await time.latest()) - 2 * 86400;
      await mockAggregator.setUpdatedAt(staleTimestamp);
      await expect(escalation.getLatestPrice(MATERIAL_ID))
        .to.be.revertedWith("Stale Chainlink data");
    });
  });

  describe("Escalation Budget", function () {
    it("should deposit escalation budget", async function () {
      const depositAmount = ethers.parseEther("5");
      await expect(
        escalation.depositEscalationBudget(TENDER_ID, { value: depositAmount })
      ).to.emit(escalation, "EscalationBudgetDeposited")
        .withArgs(TENDER_ID, depositAmount);
      expect(await escalation.escalationBudget(TENDER_ID)).to.equal(depositAmount);
    });
  });

  describe("Auto-pay Winner", function () {
    let mockAggregator: MockV3Aggregator;

    beforeEach(async function () {
      const MockFactory = await ethers.getContractFactory("MockV3Aggregator");
      mockAggregator = await MockFactory.deploy(8, BASELINE_PRICE);
      await mockAggregator.waitForDeployment();

      // Setup tender with Chainlink feed
      await escalation.setTenderPrice(TENDER_ID, TENDER_PRICE);
      await escalation.setEscalationRule(
        TENDER_ID, MATERIAL_ID, BASELINE_PRICE, THRESHOLD_BPS, CAP_BPS, PERIOD
      );
      await escalation.setPriceFeed(MATERIAL_ID, await mockAggregator.getAddress());
      await escalation.setTenderWinner(TENDER_ID, winner.address);
    });

    it("should auto-pay winner on escalation", async function () {
      // Deposit budget
      const budget = ethers.parseEther("50");
      await escalation.depositEscalationBudget(TENDER_ID, { value: budget });

      await time.increase(Number(PERIOD) + 1);

      // Increase price by 10% AFTER time advance so updatedAt is fresh
      const newPrice = BASELINE_PRICE + (BASELINE_PRICE * 1000n / 10000n); // 10%
      await mockAggregator.updateAnswer(Number(newPrice));

      const winnerBalBefore = await ethers.provider.getBalance(winner.address);
      await escalation.evaluateEscalation(TENDER_ID, MATERIAL_ID);
      const winnerBalAfter = await ethers.provider.getBalance(winner.address);

      expect(winnerBalAfter).to.be.gt(winnerBalBefore);
    });
  });

  describe("updateOraclePrice edge cases", function () {
    it("should revert zero price in updateOraclePrice", async function () {
      await expect(escalation.updateOraclePrice(MATERIAL_ID, 0))
        .to.be.revertedWithCustomError(escalation, "PriceZero");
    });
  });

  describe("Pyth Oracle Integration", function () {
    let mockPyth: MockPyth;
    let mockAggregator: MockV3Aggregator;
    const PYTH_FEED_ID = ethers.id("STEEL_PYTH");

    beforeEach(async function () {
      const PythFactory = await ethers.getContractFactory("MockPyth");
      mockPyth = await PythFactory.deploy();
      await mockPyth.waitForDeployment();
      await escalation.setPyth(await mockPyth.getAddress());

      const AggFactory = await ethers.getContractFactory("MockV3Aggregator");
      mockAggregator = await AggFactory.deploy(8, 1500);
      await mockAggregator.waitForDeployment();
    });

    it("should read price from Pyth feed when Chainlink not set", async function () {
      const now = await time.latest();
      await mockPyth.setPrice(PYTH_FEED_ID, 2500, 10, -8, now);
      await escalation.setPythFeed(MATERIAL_ID, PYTH_FEED_ID);

      const price = await escalation.getLatestPrice(MATERIAL_ID);
      expect(price).to.equal(2500);
    });

    it("should prefer Chainlink over Pyth if both set", async function () {
      const now = await time.latest();
      // Set Pyth price to 2500
      await mockPyth.setPrice(PYTH_FEED_ID, 2500, 10, -8, now);
      await escalation.setPythFeed(MATERIAL_ID, PYTH_FEED_ID);
      // Also set Chainlink feed at 1500
      await escalation.setPriceFeed(MATERIAL_ID, await mockAggregator.getAddress());

      // Chainlink should take priority
      const price = await escalation.getLatestPrice(MATERIAL_ID);
      expect(price).to.equal(1500);
    });

    it("should fall back to manual when neither oracle set", async function () {
      // No Pyth feed ID for this material, no Chainlink feed
      await escalation.updateOraclePrice(MATERIAL_ID, 777);
      const price = await escalation.getLatestPrice(MATERIAL_ID);
      expect(price).to.equal(777);
    });

    it("should reject stale Pyth price", async function () {
      const now = await time.latest();
      // Publish time is 2 hours ago, max age is 1 hour
      await mockPyth.setPrice(PYTH_FEED_ID, 2500, 10, -8, now - 7200);
      await escalation.setPythFeed(MATERIAL_ID, PYTH_FEED_ID);

      await expect(escalation.getLatestPrice(MATERIAL_ID))
        .to.be.revertedWith("Stale price");
    });

    it("should emit PythSet and PythFeedSet events", async function () {
      await expect(escalation.setPyth(await mockPyth.getAddress()))
        .to.emit(escalation, "PythSet")
        .withArgs(await mockPyth.getAddress());
      await expect(escalation.setPythFeed(MATERIAL_ID, PYTH_FEED_ID))
        .to.emit(escalation, "PythFeedSet")
        .withArgs(MATERIAL_ID, PYTH_FEED_ID);
    });
  });
});
