import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { CollisionDetector } from "../typechain-types";

describe("CollisionDetector", function () {
  let detector: CollisionDetector;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  const TENDER_ID = 1;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("CollisionDetector");
    detector = await Factory.deploy();
    await detector.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should set correct owner", async function () {
      expect(await detector.owner()).to.equal(owner.address);
    });

    it("should start with no collisions checked", async function () {
      expect(await detector.collisionChecked(TENDER_ID)).to.be.false;
    });
  });

  describe("checkCollision", function () {
    it("should check collision with 2 different prices", async function () {
      const addr = await detector.getAddress();

      const enc1 = await fhevm.encryptUint(5, 1000n, addr, owner.address); // euint64 = FhevmType 4
      const enc2 = await fhevm.encryptUint(5, 2000n, addr, owner.address);

      await detector.checkCollision(
        TENDER_ID,
        [enc1.externalEuint, enc2.externalEuint],
        [enc1.inputProof, enc2.inputProof]
      );
      expect(await detector.collisionChecked(TENDER_ID)).to.be.true;
    });

    it("should revert if already checked", async function () {
      const addr = await detector.getAddress();
      const enc1 = await fhevm.encryptUint(5, 100n, addr, owner.address);
      const enc2 = await fhevm.encryptUint(5, 200n, addr, owner.address);

      await detector.checkCollision(
        TENDER_ID,
        [enc1.externalEuint, enc2.externalEuint],
        [enc1.inputProof, enc2.inputProof]
      );

      await expect(
        detector.checkCollision(
          TENDER_ID,
          [enc1.externalEuint, enc2.externalEuint],
          [enc1.inputProof, enc2.inputProof]
        )
      ).to.be.revertedWith("Already checked");
    });

    it("should revert with less than 2 bids", async function () {
      const addr = await detector.getAddress();
      const enc1 = await fhevm.encryptUint(5, 100n, addr, owner.address);

      await expect(
        detector.checkCollision(
          TENDER_ID,
          [enc1.externalEuint],
          [enc1.inputProof]
        )
      ).to.be.revertedWith("Need at least 2 bids");
    });

    it("should revert with more than 10 bids", async function () {
      const addr = await detector.getAddress();
      const handles: string[] = [];
      const proofs: string[] = [];
      for (let i = 0; i < 11; i++) {
        const enc = await fhevm.encryptUint(5, BigInt(i * 100 + 100), addr, owner.address);
        handles.push(enc.externalEuint);
        proofs.push(enc.inputProof);
      }

      await expect(
        detector.checkCollision(TENDER_ID, handles, proofs)
      ).to.be.revertedWith("Max 10 bids");
    });

    it("should only allow owner", async function () {
      const addr = await detector.getAddress();
      const enc1 = await fhevm.encryptUint(5, 100n, addr, alice.address);
      const enc2 = await fhevm.encryptUint(5, 200n, addr, alice.address);

      await expect(
        detector.connect(alice).checkCollision(
          TENDER_ID,
          [enc1.externalEuint, enc2.externalEuint],
          [enc1.inputProof, enc2.inputProof]
        )
      ).to.be.revertedWithCustomError(detector, "OwnableUnauthorizedAccount");
    });

    it("should emit CollisionCheckStarted", async function () {
      const addr = await detector.getAddress();
      const enc1 = await fhevm.encryptUint(5, 100n, addr, owner.address);
      const enc2 = await fhevm.encryptUint(5, 200n, addr, owner.address);

      await expect(
        detector.checkCollision(
          TENDER_ID,
          [enc1.externalEuint, enc2.externalEuint],
          [enc1.inputProof, enc2.inputProof]
        )
      ).to.emit(detector, "CollisionCheckStarted")
        .withArgs(TENDER_ID, 2);
    });
  });

  describe("setCollisionResult", function () {
    it("should set collision result after check", async function () {
      const addr = await detector.getAddress();
      const enc1 = await fhevm.encryptUint(5, 100n, addr, owner.address);
      const enc2 = await fhevm.encryptUint(5, 200n, addr, owner.address);
      await detector.checkCollision(
        TENDER_ID,
        [enc1.externalEuint, enc2.externalEuint],
        [enc1.inputProof, enc2.inputProof]
      );

      await expect(detector.setCollisionResult(TENDER_ID, true))
        .to.emit(detector, "CollisionCheckCompleted")
        .withArgs(TENDER_ID, true);
      expect(await detector.collisionDetected(TENDER_ID)).to.be.true;
    });

    it("should revert if not checked yet", async function () {
      await expect(detector.setCollisionResult(TENDER_ID, false))
        .to.be.revertedWith("Not checked yet");
    });

    it("should require collisionChecked", async function () {
      await expect(detector.setCollisionResult(99, true))
        .to.be.revertedWith("Not checked yet");
    });
  });
});
