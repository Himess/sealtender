import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deploying SealTender protocol with deployer:", deployer);

  // 1. Deploy BidderRegistry
  const registry = await deploy("BidderRegistry", {
    from: deployer,
    args: [deployer],
    log: true,
  });
  console.log("BidderRegistry deployed at:", registry.address);

  // 2. Deploy BidEscrow
  const escrow = await deploy("BidEscrow", {
    from: deployer,
    args: [],
    log: true,
  });
  console.log("BidEscrow deployed at:", escrow.address);

  // 3. Deploy ConfidentialUSDC
  const cUSDC = await deploy("ConfidentialUSDC", {
    from: deployer,
    args: [deployer],
    log: true,
  });
  console.log("ConfidentialUSDC deployed at:", cUSDC.address);

  // 4. Deploy TenderFactory
  const factory = await deploy("TenderFactory", {
    from: deployer,
    args: [registry.address, escrow.address],
    log: true,
  });
  console.log("TenderFactory deployed at:", factory.address);

  // 5. Deploy DisputeManager
  const disputeManager = await deploy("DisputeManager", {
    from: deployer,
    args: [escrow.address, deployer, registry.address],
    log: true,
  });
  console.log("DisputeManager deployed at:", disputeManager.address);

  // 6. Deploy PriceEscalation
  const escalation = await deploy("PriceEscalation", {
    from: deployer,
    args: [],
    log: true,
  });
  console.log("PriceEscalation deployed at:", escalation.address);

  // 7. Deploy CollisionDetector
  const collisionDetector = await deploy("CollisionDetector", {
    from: deployer,
    args: [],
    log: true,
  });
  console.log("CollisionDetector deployed at:", collisionDetector.address);

  // --- Post-deploy setup ---
  console.log("\nConfiguring cross-contract permissions...");

  const escrowContract = await hre.ethers.getContractAt("BidEscrow", escrow.address);
  const registryContract = await hre.ethers.getContractAt("BidderRegistry", registry.address);
  const factoryContract = await hre.ethers.getContractAt("TenderFactory", factory.address);

  // Helper to wait for tx confirmation (avoids nonce race conditions)
  const sendTx = async (txPromise: Promise<any>, label: string) => {
    const tx = await txPromise;
    await tx.wait();
    console.log(label);
  };

  // Authorize factory in escrow
  await sendTx(escrowContract.authorizeCaller(factory.address), "Escrow: authorized TenderFactory");

  // Authorize factory in registry
  await sendTx(registryContract.addAuthorizedCaller(factory.address), "Registry: authorized TenderFactory");

  // Authorize dispute manager in registry
  await sendTx(registryContract.addAuthorizedCaller(disputeManager.address), "Registry: authorized DisputeManager");

  // Authorize dispute manager in escrow (CRITICAL: without this, DisputeManager.resolveDispute() → escrow.slash() reverts)
  await sendTx(escrowContract.authorizeCaller(disputeManager.address), "Escrow: authorized DisputeManager");

  // Set modules in factory
  await sendTx(factoryContract.setDisputeManager(disputeManager.address), "Factory: set DisputeManager");
  await sendTx(factoryContract.setEscalation(escalation.address), "Factory: set PriceEscalation");
  await sendTx(factoryContract.setCollisionDetector(collisionDetector.address), "Factory: set CollisionDetector");

  console.log("\n=== SealTender Deployment Complete ===");
  console.log("BidderRegistry:     ", registry.address);
  console.log("BidEscrow:          ", escrow.address);
  console.log("ConfidentialUSDC:   ", cUSDC.address);
  console.log("TenderFactory:      ", factory.address);
  console.log("DisputeManager:     ", disputeManager.address);
  console.log("PriceEscalation:    ", escalation.address);
  console.log("CollisionDetector:  ", collisionDetector.address);
};

func.tags = ["SealTender"];
export default func;
