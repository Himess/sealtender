import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Per-network external integrations. The ERC-7984 wrapper takes its underlying
 * USDC at construction (immutable), so this address must be correct for the
 * target network — there is no "propose/execute" timelock to fix it later
 * (that would lie about a property the parent enforces as immutable).
 *
 * Sources:
 *  - Circle USDC on Sepolia: https://developers.circle.com/stablecoins/docs/usdc-on-test-networks
 *  - Pyth on Sepolia: https://docs.pyth.network/price-feeds/contract-addresses/evm
 */
const EXTERNAL: Record<string, { usdc: string; pyth: string }> = {
  sepolia: {
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    pyth: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21",
  },
  mainnet: {
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    pyth: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6",
  },
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const network = hre.network.name;

  console.log(`Deploying SealTender on ${network} with deployer: ${deployer}`);

  // 1. BidderRegistry
  const registry = await deploy("BidderRegistry", {
    from: deployer,
    args: [deployer],
    log: true,
  });

  // 2. BidEscrow
  const escrow = await deploy("BidEscrow", {
    from: deployer,
    args: [],
    log: true,
  });

  // 3. ConfidentialUSDC — ERC-7984 wrapper, underlying USDC bound at construction
  const ext = EXTERNAL[network];
  let underlyingUSDC: string;
  if (ext) {
    underlyingUSDC = ext.usdc;
  } else {
    // Local network only — deploy MockUSDC as the underlying so unit tests run.
    const mockUsdc = await deploy("MockUSDC", { from: deployer, args: [], log: true });
    underlyingUSDC = mockUsdc.address;
  }

  const cUSDC = await deploy("ConfidentialUSDC", {
    from: deployer,
    args: [deployer, underlyingUSDC],
    log: true,
  });

  // 4. PriceEscalation (must be deployed before TenderFactory so factory can wire it as winnerSink)
  const escalation = await deploy("PriceEscalation", {
    from: deployer,
    args: [],
    log: true,
  });

  // 5. CollisionDetector
  const collisionDetector = await deploy("CollisionDetector", {
    from: deployer,
    args: [],
    log: true,
  });

  // 6. TenderFactory
  const factory = await deploy("TenderFactory", {
    from: deployer,
    args: [registry.address, escrow.address],
    log: true,
  });

  // 7. DisputeManager (needs municipality address — using deployer as placeholder)
  const disputeManager = await deploy("DisputeManager", {
    from: deployer,
    args: [escrow.address, deployer, registry.address],
    log: true,
  });

  // --- Post-deploy wiring ---
  console.log("\nWiring cross-contract permissions and external feeds...");

  const escrowContract = await hre.ethers.getContractAt("BidEscrow", escrow.address);
  const registryContract = await hre.ethers.getContractAt("BidderRegistry", registry.address);
  const factoryContract = await hre.ethers.getContractAt("TenderFactory", factory.address);
  const escalationContract = await hre.ethers.getContractAt("PriceEscalation", escalation.address);

  const sendTx = async (txPromise: Promise<any>, label: string) => {
    const tx = await txPromise;
    await tx.wait();
    console.log(`  ✓ ${label}`);
  };

  // Factory becomes the registry's sole `tenderManager`. With the new privilege model,
  // only the tenderManager (or owner) can authorize new tender contracts —
  // closing the prior privilege-escalation surface where any authorized
  // contract could add more callers.
  await sendTx(registryContract.setTenderManager(factory.address), "Registry: tenderManager → TenderFactory");

  // Factory itself must also be authorized so its createTender can call
  // BidderRegistry.addAuthorizedCaller(...). (Owner can call via setTenderManager
  // but auto-authorize wiring goes through addAuthorizedCaller in the factory.)
  // No-op needed: setTenderManager already grants the auth path.

  // DisputeManager records slashes/freezes — needs explicit registry + escrow auth
  await sendTx(registryContract.addAuthorizedCaller(disputeManager.address), "Registry: authorize DisputeManager");
  await sendTx(escrowContract.authorizeCaller(disputeManager.address), "Escrow: authorize DisputeManager");

  // Factory needs to setRequiredDeposit on escrow — escrow's onlyAuthorized gate
  await sendTx(escrowContract.authorizeCaller(factory.address), "Escrow: authorize TenderFactory");

  // Wire factory's module references (used by frontend / off-chain tooling)
  await sendTx(factoryContract.setDisputeManager(disputeManager.address), "Factory: setDisputeManager");
  await sendTx(factoryContract.setEscalation(escalation.address), "Factory: setEscalation");
  await sendTx(factoryContract.setCollisionDetector(collisionDetector.address), "Factory: setCollisionDetector");

  // External integrations — only on public networks (skip on hardhat/localhost)
  if (ext) {
    await sendTx(escalationContract.setPyth(ext.pyth), `PriceEscalation: Pyth → ${ext.pyth}`);
    console.log(`  ✓ ConfidentialUSDC underlying: ${ext.usdc} (immutable, bound at construction)`);
  } else {
    console.log("  ⚠ Local network — Pyth must be wired by tests; underlying USDC is MockUSDC");
  }

  console.log("\n=== SealTender Deployment Complete ===");
  console.log("BidderRegistry:     ", registry.address);
  console.log("BidEscrow:          ", escrow.address);
  console.log("ConfidentialUSDC:   ", cUSDC.address);
  console.log("PriceEscalation:    ", escalation.address);
  console.log("CollisionDetector:  ", collisionDetector.address);
  console.log("TenderFactory:      ", factory.address);
  console.log("DisputeManager:     ", disputeManager.address);
  if (ext) {
    console.log("Underlying USDC:    ", ext.usdc);
    console.log("Pyth:               ", ext.pyth);
  }
};

func.tags = ["SealTender"];
export default func;
