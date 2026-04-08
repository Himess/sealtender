import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ConfidentialUSDC, MockUSDC } from "../typechain-types";

describe("ConfidentialUSDC", function () {
  let cusdc: ConfidentialUSDC;
  let mockUsdc: MockUSDC;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  const WRAP_AMOUNT = 1000n * 10n ** 6n; // 1000 USDC
  const FAUCET_AMOUNT = 500n * 10n ** 6n;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const MockFactory = await ethers.getContractFactory("MockUSDC");
    mockUsdc = await MockFactory.deploy();
    await mockUsdc.waitForDeployment();

    const CUSDCFactory = await ethers.getContractFactory("ConfidentialUSDC");
    cusdc = await CUSDCFactory.deploy(owner.address);
    await cusdc.waitForDeployment();

    // Set underlying USDC
    await cusdc.setUnderlyingUSDC(await mockUsdc.getAddress());
  });

  describe("Deployment", function () {
    it("should set correct owner", async function () {
      expect(await cusdc.owner()).to.equal(owner.address);
    });

    it("should have correct name", async function () {
      expect(await cusdc.name()).to.equal("Confidential USDC");
    });

    it("should have correct symbol", async function () {
      expect(await cusdc.symbol()).to.equal("cUSDC");
    });

    it("should have FAUCET_COOLDOWN of 1 hour", async function () {
      expect(await cusdc.FAUCET_COOLDOWN()).to.equal(3600);
    });
  });

  describe("setUnderlyingUSDC", function () {
    it("should set underlying USDC on fresh deploy", async function () {
      const CUSDCFactory = await ethers.getContractFactory("ConfidentialUSDC");
      const freshCusdc = await CUSDCFactory.deploy(owner.address);
      await freshCusdc.waitForDeployment();
      await expect(freshCusdc.setUnderlyingUSDC(await mockUsdc.getAddress()))
        .to.emit(freshCusdc, "UnderlyingUSDCSet");
    });

    it("should only allow owner", async function () {
      const CUSDCFactory = await ethers.getContractFactory("ConfidentialUSDC");
      const freshCusdc = await CUSDCFactory.deploy(owner.address);
      await freshCusdc.waitForDeployment();
      await expect(freshCusdc.connect(alice).setUnderlyingUSDC(await mockUsdc.getAddress()))
        .to.be.revertedWithCustomError(freshCusdc, "OwnableUnauthorizedAccount");
    });
  });

  describe("wrap", function () {
    beforeEach(async function () {
      await mockUsdc.mint(alice.address, WRAP_AMOUNT);
      await mockUsdc.connect(alice).approve(await cusdc.getAddress(), WRAP_AMOUNT);
    });

    it("should wrap USDC into cUSDC", async function () {
      await expect(cusdc.connect(alice).wrap(WRAP_AMOUNT))
        .to.emit(cusdc, "Wrapped")
        .withArgs(alice.address, WRAP_AMOUNT);
    });

    it("should transfer underlying USDC", async function () {
      await cusdc.connect(alice).wrap(WRAP_AMOUNT);
      expect(await mockUsdc.balanceOf(await cusdc.getAddress())).to.equal(WRAP_AMOUNT);
    });

    it("should revert with zero amount", async function () {
      await expect(cusdc.connect(alice).wrap(0))
        .to.be.revertedWithCustomError(cusdc, "WrapAmountZero");
    });

    it("should revert when underlying not set", async function () {
      const CUSDCFactory = await ethers.getContractFactory("ConfidentialUSDC");
      const cusdc2 = await CUSDCFactory.deploy(owner.address);
      await cusdc2.waitForDeployment();
      // underlyingUSDC is address(0)
      await expect(cusdc2.connect(alice).wrap(100))
        .to.be.revertedWithCustomError(cusdc2, "WrapDisabled");
    });
  });

  describe("unwrap", function () {
    beforeEach(async function () {
      await mockUsdc.mint(alice.address, WRAP_AMOUNT);
      await mockUsdc.connect(alice).approve(await cusdc.getAddress(), WRAP_AMOUNT);
      await cusdc.connect(alice).wrap(WRAP_AMOUNT);
    });

    it("should unwrap cUSDC back to USDC", async function () {
      await expect(cusdc.connect(alice).unwrap(WRAP_AMOUNT))
        .to.emit(cusdc, "Unwrapped")
        .withArgs(alice.address, WRAP_AMOUNT);
    });

    it("should revert with zero amount", async function () {
      await expect(cusdc.connect(alice).unwrap(0))
        .to.be.revertedWithCustomError(cusdc, "WrapAmountZero");
    });
  });

  describe("faucet", function () {
    it("should mint cUSDC via faucet", async function () {
      await expect(cusdc.connect(alice).faucet(FAUCET_AMOUNT))
        .to.emit(cusdc, "FaucetUsed")
        .withArgs(alice.address, FAUCET_AMOUNT);
    });

    it("should revert on zero amount", async function () {
      await expect(cusdc.connect(alice).faucet(0))
        .to.be.revertedWithCustomError(cusdc, "FaucetAmountZero");
    });

    it("should revert on amount exceeding max", async function () {
      const maxAmount = await cusdc.FAUCET_MAX();
      await expect(cusdc.connect(alice).faucet(maxAmount + 1n))
        .to.be.revertedWithCustomError(cusdc, "FaucetAmountExceedsMax");
    });

    it("should enforce cooldown period", async function () {
      await cusdc.connect(alice).faucet(FAUCET_AMOUNT);
      await expect(cusdc.connect(alice).faucet(FAUCET_AMOUNT))
        .to.be.revertedWithCustomError(cusdc, "FaucetCooldown");
    });

    it("should allow faucet after cooldown expires", async function () {
      await cusdc.connect(alice).faucet(FAUCET_AMOUNT);
      await time.increase(3601); // 1 hour + 1 second
      await expect(cusdc.connect(alice).faucet(FAUCET_AMOUNT))
        .to.emit(cusdc, "FaucetUsed");
    });
  });

  describe("mint/burn (admin)", function () {
    it("should allow owner to mint", async function () {
      await expect(cusdc.mint(alice.address, 1000))
        .to.emit(cusdc, "Minted")
        .withArgs(alice.address, 1000);
    });

    it("should allow owner to burn", async function () {
      await cusdc.mint(alice.address, 1000);
      await expect(cusdc.burn(alice.address, 500))
        .to.emit(cusdc, "Burned")
        .withArgs(alice.address, 500);
    });
  });

  describe("Underlying USDC Timelock", function () {
    it("should only allow initial setUnderlyingUSDC when address is zero", async function () {
      // underlyingUSDC is already set in beforeEach, so setting again should revert
      const MockFactory = await ethers.getContractFactory("MockUSDC");
      const mockUsdc2 = await MockFactory.deploy();
      await mockUsdc2.waitForDeployment();
      await expect(cusdc.setUnderlyingUSDC(await mockUsdc2.getAddress()))
        .to.be.revertedWith("Use propose/execute to change");
    });

    it("should propose and execute underlying change with delay", async function () {
      const MockFactory = await ethers.getContractFactory("MockUSDC");
      const mockUsdc2 = await MockFactory.deploy();
      await mockUsdc2.waitForDeployment();

      await cusdc.proposeUnderlyingUSDC(await mockUsdc2.getAddress());
      // Wait 2 days
      await time.increase(2 * 24 * 60 * 60);
      await expect(cusdc.executeUnderlyingUSDCChange())
        .to.emit(cusdc, "UnderlyingUSDCSet")
        .withArgs(await mockUsdc2.getAddress());
      expect(await cusdc.underlyingUSDC()).to.equal(await mockUsdc2.getAddress());
    });

    it("should revert execute before timelock expires", async function () {
      const MockFactory = await ethers.getContractFactory("MockUSDC");
      const mockUsdc2 = await MockFactory.deploy();
      await mockUsdc2.waitForDeployment();

      await cusdc.proposeUnderlyingUSDC(await mockUsdc2.getAddress());
      // Try to execute immediately
      await expect(cusdc.executeUnderlyingUSDCChange())
        .to.be.revertedWith("Timelock not expired");
    });
  });
});
