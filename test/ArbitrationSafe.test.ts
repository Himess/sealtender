import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ArbitrationSafe, DisputeManager, BidEscrow, BidderRegistry } from "../typechain-types";

// Mirrors enum DisputeStatus in contracts/interfaces/ISealTender.sol.
const DisputeStatus = {
  Open: 0,
  Investigating: 1,
  Slashed: 2,
  Frozen: 3,
  Dismissed: 4,
} as const;

describe("ArbitrationSafe", function () {
  let safe: ArbitrationSafe;
  let disputeManager: DisputeManager;
  let escrow: BidEscrow;
  let registry: BidderRegistry;
  let owner: HardhatEthersSigner;
  let municipality: HardhatEthersSigner;
  let complainant: HardhatEthersSigner;
  let accused: HardhatEthersSigner;
  let arb1: HardhatEthersSigner;
  let arb2: HardhatEthersSigner;
  let arb3: HardhatEthersSigner;
  let arb4: HardhatEthersSigner;
  let arb5: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;

  const TENDER_ID = 0;
  const CITIZEN_STAKE = ethers.parseEther("0.0005");
  const COMPANY_STAKE_MIN = ethers.parseEther("0.001");

  beforeEach(async function () {
    [owner, municipality, complainant, accused, arb1, arb2, arb3, arb4, arb5, outsider] =
      await ethers.getSigners();

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
    await escrow.authorizeCaller(await disputeManager.getAddress());

    const SafeFactory = await ethers.getContractFactory("ArbitrationSafe");
    safe = await SafeFactory.deploy(
      await disputeManager.getAddress(),
      [arb1.address, arb2.address, arb3.address, arb4.address, arb5.address]
    );
    await safe.waitForDeployment();

    // Wire safe as DisputeManager.courtAuthority so resolveDispute calls
    // from the safe pass the onlyOwnerOrCourt gate.
    await disputeManager.setCourtAuthority(await safe.getAddress());
  });

  describe("Deployment", function () {
    it("registers the 5 arbitrators", async function () {
      expect(await safe.arbitratorCount()).to.equal(5);
      const list = await safe.getArbitrators();
      expect(list).to.deep.equal([
        arb1.address,
        arb2.address,
        arb3.address,
        arb4.address,
        arb5.address,
      ]);
      expect(await safe.isArbitrator(arb3.address)).to.be.true;
      expect(await safe.isArbitrator(outsider.address)).to.be.false;
    });

    it("rejects empty arbitrator list", async function () {
      const SafeFactory = await ethers.getContractFactory("ArbitrationSafe");
      await expect(
        SafeFactory.deploy(await disputeManager.getAddress(), [])
      ).to.be.revertedWithCustomError(safe, "InvalidArbitratorCount");
    });

    it("rejects more than MAX_ARBITRATORS", async function () {
      const sixth = (await ethers.getSigners())[10];
      const SafeFactory = await ethers.getContractFactory("ArbitrationSafe");
      await expect(
        SafeFactory.deploy(await disputeManager.getAddress(), [
          arb1.address,
          arb2.address,
          arb3.address,
          arb4.address,
          arb5.address,
          sixth.address,
        ])
      ).to.be.revertedWithCustomError(safe, "InvalidArbitratorCount");
    });

    it("rejects duplicate arbitrators in initial set", async function () {
      const SafeFactory = await ethers.getContractFactory("ArbitrationSafe");
      await expect(
        SafeFactory.deploy(await disputeManager.getAddress(), [
          arb1.address,
          arb1.address,
          arb3.address,
        ])
      ).to.be.revertedWithCustomError(safe, "DuplicateArbitrator");
    });

    it("rejects zero disputeManager", async function () {
      const SafeFactory = await ethers.getContractFactory("ArbitrationSafe");
      await expect(
        SafeFactory.deploy(ethers.ZeroAddress, [arb1.address])
      ).to.be.revertedWithCustomError(safe, "ZeroAddress");
    });
  });

  describe("voteResolve threshold execution", function () {
    let disputeId: bigint;

    beforeEach(async function () {
      // File a citizen complaint so we have an Open dispute to vote on.
      const tx = await disputeManager
        .connect(complainant)
        .fileCitizenComplaint(TENDER_ID, accused.address, "demo abuse", {
          value: CITIZEN_STAKE,
        });
      const rc = await tx.wait();
      // disputeCount-1 == new disputeId after the call.
      disputeId = (await disputeManager.disputeCount()) - 1n;
    });

    it("rejects non-arbitrators", async function () {
      await expect(
        safe.connect(outsider).voteResolve(disputeId, DisputeStatus.Dismissed)
      ).to.be.revertedWithCustomError(safe, "NotArbitrator");
    });

    it("rejects double-voting on same (disputeId, resolution)", async function () {
      await safe.connect(arb1).voteResolve(disputeId, DisputeStatus.Dismissed);
      await expect(
        safe.connect(arb1).voteResolve(disputeId, DisputeStatus.Dismissed)
      ).to.be.revertedWithCustomError(safe, "AlreadyVoted");
    });

    it("rejects invalid resolutions (Open, Investigating)", async function () {
      await expect(
        safe.connect(arb1).voteResolve(disputeId, DisputeStatus.Open)
      ).to.be.revertedWithCustomError(safe, "InvalidResolution");
      await expect(
        safe.connect(arb1).voteResolve(disputeId, DisputeStatus.Investigating)
      ).to.be.revertedWithCustomError(safe, "InvalidResolution");
    });

    it("does not execute below threshold (1 of 5)", async function () {
      await safe.connect(arb1).voteResolve(disputeId, DisputeStatus.Dismissed);
      const d = await disputeManager.disputes(disputeId);
      expect(d.status).to.equal(DisputeStatus.Open);
      expect(await safe.executed(disputeId)).to.be.false;
      expect(
        await safe.voteCount(disputeId, DisputeStatus.Dismissed)
      ).to.equal(1);
    });

    it("does not execute below threshold (2 of 5)", async function () {
      await safe.connect(arb1).voteResolve(disputeId, DisputeStatus.Dismissed);
      await safe.connect(arb2).voteResolve(disputeId, DisputeStatus.Dismissed);
      expect(await safe.executed(disputeId)).to.be.false;
    });

    it("executes at threshold (3 of 5) and updates DisputeManager state", async function () {
      await safe.connect(arb1).voteResolve(disputeId, DisputeStatus.Dismissed);
      await safe.connect(arb2).voteResolve(disputeId, DisputeStatus.Dismissed);
      await expect(
        safe.connect(arb3).voteResolve(disputeId, DisputeStatus.Dismissed)
      )
        .to.emit(safe, "ResolutionExecuted")
        .withArgs(disputeId, DisputeStatus.Dismissed, arb3.address);

      const d = await disputeManager.disputes(disputeId);
      expect(d.status).to.equal(DisputeStatus.Dismissed);
      expect(await safe.executed(disputeId)).to.be.true;
    });

    it("rejects further votes once executed", async function () {
      await safe.connect(arb1).voteResolve(disputeId, DisputeStatus.Dismissed);
      await safe.connect(arb2).voteResolve(disputeId, DisputeStatus.Dismissed);
      await safe.connect(arb3).voteResolve(disputeId, DisputeStatus.Dismissed);
      await expect(
        safe.connect(arb4).voteResolve(disputeId, DisputeStatus.Dismissed)
      ).to.be.revertedWithCustomError(safe, "AlreadyExecuted");
    });

    it("does not converge when arbitrators disagree on resolution", async function () {
      // 2 vote Dismissed, 2 vote Slashed -- neither reaches 3. Dispute stays Open.
      await safe.connect(arb1).voteResolve(disputeId, DisputeStatus.Dismissed);
      await safe.connect(arb2).voteResolve(disputeId, DisputeStatus.Dismissed);
      await safe.connect(arb3).voteResolve(disputeId, DisputeStatus.Slashed);
      await safe.connect(arb4).voteResolve(disputeId, DisputeStatus.Slashed);
      const d = await disputeManager.disputes(disputeId);
      expect(d.status).to.equal(DisputeStatus.Open);
    });
  });

  describe("DisputeManager backward-compat", function () {
    it("owner can still resolve directly (legacy path)", async function () {
      const tx = await disputeManager
        .connect(complainant)
        .fileCitizenComplaint(TENDER_ID, accused.address, "another", {
          value: CITIZEN_STAKE,
        });
      await tx.wait();
      const disputeId = (await disputeManager.disputeCount()) - 1n;

      await disputeManager
        .connect(owner)
        .resolveDispute(disputeId, DisputeStatus.Dismissed);
      const d = await disputeManager.disputes(disputeId);
      expect(d.status).to.equal(DisputeStatus.Dismissed);
    });

    it("non-owner non-court reverts on resolveDispute", async function () {
      const tx = await disputeManager
        .connect(complainant)
        .fileCitizenComplaint(TENDER_ID, accused.address, "another2", {
          value: CITIZEN_STAKE,
        });
      await tx.wait();
      const disputeId = (await disputeManager.disputeCount()) - 1n;

      await expect(
        disputeManager
          .connect(outsider)
          .resolveDispute(disputeId, DisputeStatus.Dismissed)
      ).to.be.revertedWithCustomError(disputeManager, "NotCourtAuthority");
    });
  });

  describe("Admin: arbitrator rotation", function () {
    it("owner can add a new arbitrator up to MAX", async function () {
      // Constructor used 5 already, MAX_ARBITRATORS = 5 -- adding another reverts.
      await expect(
        safe.addArbitrator(outsider.address)
      ).to.be.revertedWithCustomError(safe, "InvalidArbitratorCount");
    });

    it("owner can remove an arbitrator and quorum still works with remaining", async function () {
      await expect(safe.removeArbitrator(arb5.address))
        .to.emit(safe, "ArbitratorRemoved")
        .withArgs(arb5.address);
      expect(await safe.arbitratorCount()).to.equal(4);
      expect(await safe.isArbitrator(arb5.address)).to.be.false;

      // Now THRESHOLD=3 of 4 should still work via remaining 4.
      const tx = await disputeManager
        .connect(complainant)
        .fileCitizenComplaint(TENDER_ID, accused.address, "post-remove", {
          value: CITIZEN_STAKE,
        });
      await tx.wait();
      const disputeId = (await disputeManager.disputeCount()) - 1n;

      await safe.connect(arb1).voteResolve(disputeId, DisputeStatus.Dismissed);
      await safe.connect(arb2).voteResolve(disputeId, DisputeStatus.Dismissed);
      await safe.connect(arb3).voteResolve(disputeId, DisputeStatus.Dismissed);
      const d = await disputeManager.disputes(disputeId);
      expect(d.status).to.equal(DisputeStatus.Dismissed);
    });

    it("non-owner cannot rotate arbitrators", async function () {
      await expect(
        safe.connect(arb1).removeArbitrator(arb5.address)
      ).to.be.revertedWithCustomError(safe, "OwnableUnauthorizedAccount");
    });
  });
});
