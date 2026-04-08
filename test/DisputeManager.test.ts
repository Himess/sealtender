import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DisputeManager, BidEscrow, BidderRegistry } from "../typechain-types";

describe("DisputeManager", function () {
  let disputeManager: DisputeManager;
  let escrow: BidEscrow;
  let registry: BidderRegistry;
  let owner: HardhatEthersSigner;
  let municipality: HardhatEthersSigner;
  let complainant: HardhatEthersSigner;
  let accused: HardhatEthersSigner;
  let courtAuthority: HardhatEthersSigner;
  const STAKE = ethers.parseEther("0.01");
  const TENDER_ID = 0;
  const DEPOSIT_AMOUNT = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, municipality, complainant, accused, courtAuthority] = await ethers.getSigners();

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

    // Authorize dispute manager on escrow
    await escrow.authorizeCaller(await disputeManager.getAddress());
  });

  describe("Deployment", function () {
    it("should set correct escrow", async function () {
      expect(await disputeManager.escrow()).to.equal(await escrow.getAddress());
    });

    it("should set correct municipality", async function () {
      expect(await disputeManager.municipality()).to.equal(municipality.address);
    });

    it("should set correct registry", async function () {
      expect(await disputeManager.registry()).to.equal(await registry.getAddress());
    });

    it("should revert with zero address for escrow", async function () {
      const DMFactory = await ethers.getContractFactory("DisputeManager");
      await expect(DMFactory.deploy(ethers.ZeroAddress, municipality.address, await registry.getAddress()))
        .to.be.revertedWithCustomError(disputeManager, "ZeroAddress");
    });

    it("should revert with zero address for municipality", async function () {
      const DMFactory = await ethers.getContractFactory("DisputeManager");
      await expect(DMFactory.deploy(await escrow.getAddress(), ethers.ZeroAddress, await registry.getAddress()))
        .to.be.revertedWithCustomError(disputeManager, "ZeroAddress");
    });

    it("should revert with zero address for registry", async function () {
      const DMFactory = await ethers.getContractFactory("DisputeManager");
      await expect(DMFactory.deploy(await escrow.getAddress(), municipality.address, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(disputeManager, "ZeroAddress");
    });

    it("should start with zero disputes", async function () {
      expect(await disputeManager.disputeCount()).to.equal(0);
    });
  });

  describe("setCourtAuthority", function () {
    it("should set court authority", async function () {
      await disputeManager.setCourtAuthority(courtAuthority.address);
      expect(await disputeManager.courtAuthority()).to.equal(courtAuthority.address);
    });

    it("should revert on zero address", async function () {
      await expect(disputeManager.setCourtAuthority(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(disputeManager, "ZeroAddress");
    });
  });

  describe("fileCompanyComplaint", function () {
    it("should file complaint with sufficient stake", async function () {
      await expect(
        disputeManager.connect(complainant).fileCompanyComplaint(
          TENDER_ID, accused.address, "Fraud",
          { value: STAKE }
        )
      ).to.emit(disputeManager, "DisputeFiled")
        .withArgs(0, TENDER_ID, complainant.address, accused.address);
    });

    it("should revert with insufficient stake", async function () {
      await expect(
        disputeManager.connect(complainant).fileCompanyComplaint(
          TENDER_ID, accused.address, "Fraud",
          { value: STAKE / 2n }
        )
      ).to.be.revertedWithCustomError(disputeManager, "InsufficientStake");
    });

    it("should increment dispute count", async function () {
      await disputeManager.connect(complainant).fileCompanyComplaint(
        TENDER_ID, accused.address, "Fraud", { value: STAKE }
      );
      expect(await disputeManager.disputeCount()).to.equal(1);
    });
  });

  describe("fileCitizenComplaint", function () {
    it("should file citizen complaint without stake", async function () {
      await expect(
        disputeManager.connect(complainant).fileCitizenComplaint(
          TENDER_ID, accused.address, "Environmental concern"
        )
      ).to.emit(disputeManager, "DisputeFiled");
    });
  });

  describe("executeCourtOrder", function () {
    beforeEach(async function () {
      await disputeManager.setCourtAuthority(courtAuthority.address);
      await escrow.setRequiredDeposit(TENDER_ID, DEPOSIT_AMOUNT);
      await escrow.connect(accused).deposit(TENDER_ID, { value: DEPOSIT_AMOUNT });
    });

    it("should execute court order with freeze", async function () {
      await expect(
        disputeManager.connect(courtAuthority).executeCourtOrder(
          TENDER_ID, accused.address, "Court order", true
        )
      ).to.emit(disputeManager, "DisputeResolved");
    });

    it("should execute court order without freeze (dismissed)", async function () {
      await disputeManager.connect(courtAuthority).executeCourtOrder(
        TENDER_ID, accused.address, "Court order", false
      );
      const dispute = await disputeManager.getDispute(0);
      expect(dispute.status).to.equal(4); // Dismissed
    });

    it("should revert if caller is not court authority", async function () {
      await expect(
        disputeManager.connect(complainant).executeCourtOrder(
          TENDER_ID, accused.address, "Court order", true
        )
      ).to.be.revertedWithCustomError(disputeManager, "NotCourtAuthority");
    });
  });

  describe("resolveDispute", function () {
    beforeEach(async function () {
      await escrow.setRequiredDeposit(TENDER_ID, DEPOSIT_AMOUNT);
      await escrow.connect(accused).deposit(TENDER_ID, { value: DEPOSIT_AMOUNT });
      await registry.registerBidder(accused.address);
      await registry.addAuthorizedCaller(await disputeManager.getAddress());
    });

    it("should resolve as Dismissed and send stake to municipality", async function () {
      await disputeManager.connect(complainant).fileCompanyComplaint(
        TENDER_ID, accused.address, "Fraud", { value: STAKE }
      );

      const muniBalBefore = await ethers.provider.getBalance(municipality.address);
      await disputeManager.resolveDispute(0, 4); // Dismissed
      const muniBalAfter = await ethers.provider.getBalance(municipality.address);

      expect(muniBalAfter - muniBalBefore).to.equal(STAKE);
    });

    it("should resolve as Slashed and slash escrow to municipality", async function () {
      await disputeManager.connect(complainant).fileCompanyComplaint(
        TENDER_ID, accused.address, "Fraud", { value: STAKE }
      );
      await escrow.freeze(TENDER_ID, accused.address);

      await expect(disputeManager.resolveDispute(0, 2)) // Slashed
        .to.emit(disputeManager, "DisputeResolved")
        .withArgs(0, 2);
    });

    it("should revert on invalid dispute ID", async function () {
      await expect(disputeManager.resolveDispute(999, 4))
        .to.be.revertedWithCustomError(disputeManager, "InvalidDisputeId");
    });

    it("should revert if already resolved", async function () {
      await disputeManager.connect(complainant).fileCitizenComplaint(
        TENDER_ID, accused.address, "Reason"
      );
      await disputeManager.resolveDispute(0, 4); // Dismissed
      await expect(disputeManager.resolveDispute(0, 2))
        .to.be.revertedWithCustomError(disputeManager, "DisputeAlreadyResolved");
    });
  });

  describe("getDispute", function () {
    it("should return dispute details", async function () {
      await disputeManager.connect(complainant).fileCitizenComplaint(
        TENDER_ID, accused.address, "Reason"
      );
      const dispute = await disputeManager.getDispute(0);
      expect(dispute.complainant).to.equal(complainant.address);
      expect(dispute.accused).to.equal(accused.address);
      expect(dispute.tenderId).to.equal(TENDER_ID);
    });

    it("should revert on invalid dispute ID", async function () {
      await expect(disputeManager.getDispute(0))
        .to.be.revertedWithCustomError(disputeManager, "InvalidDisputeId");
    });
  });

  describe("getDisputesByTender", function () {
    it("should return dispute IDs for a tender", async function () {
      await disputeManager.connect(complainant).fileCitizenComplaint(
        TENDER_ID, accused.address, "Reason1"
      );
      await disputeManager.connect(complainant).fileCitizenComplaint(
        TENDER_ID, accused.address, "Reason2"
      );
      const disputes = await disputeManager.getDisputesByTender(TENDER_ID);
      expect(disputes.length).to.equal(2);
    });
  });
});
