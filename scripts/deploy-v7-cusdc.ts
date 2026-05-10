// v7 deploy: full cUSDC-native protocol stack.
//
// What this deploys (all fresh on Sepolia):
//   1. MockUSDC                — freely mintable ERC-20, 6 decimals (demo only)
//   2. ConfidentialUSDC        — ERC-7984 wrapper over MockUSDC
//   3. BidderRegistry          — fresh (so deployer is the owner of v7 stack)
//   4. BidEscrow (v7)          — cUSDC-native, accepts confidentialTransferFrom
//   5. TenderFactory (v7)      — wires registry + cUSDC escrow
//   6. DisputeManager (v7)     — pointed at new escrow
//   7. ArbitrationSafe         — 3-of-5 multi-sig, wired as courtAuthority
//   8. PriceEscalation         — fresh; tenderManager = factory
//   9. CollisionDetector       — fresh; tenderManager = factory
//
// Post-deploy wiring:
//   • registry.setTenderManager(factory)
//   • escrow.authorizeCaller(factory)
//   • escrow.authorizeCaller(disputeManager)
//   • disputeManager.setCourtAuthority(arbitrationSafe)
//   • factory.setEscalation(priceEscalation)
//   • factory.setDisputeManager(disputeManager)
//   • factory.setCollisionDetector(collisionDetector)
//   • priceEscalation.setTenderManager(factory)
//
// Output: deployments/sepolia/v7-cusdc.json with every fresh address.
//
// Run: npx ts-node --transpile-only scripts/deploy-v7-cusdc.ts
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ethers } from "ethers";

const SEPOLIA_RPC =
  process.env.POPULATE_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!KEY) throw new Error("DEPLOYER_PRIVATE_KEY missing in .env");

const PRIORITY_FEE_BUMP = ethers.parseUnits("3", "gwei");

// 5 deterministic arbitrator addresses (same seeds as v4).
const ARBITRATOR_SEEDS = [
  "sealtender::arbitrator::kik-seat",
  "sealtender::arbitrator::idari-mahkeme",
  "sealtender::arbitrator::sektor-1",
  "sealtender::arbitrator::sektor-2",
  "sealtender::arbitrator::stk",
];

function arbitrator(seed: string): string {
  const k = ethers.keccak256(ethers.toUtf8Bytes(seed));
  return new ethers.Wallet(k).address;
}

function loadArtifact(name: string) {
  return JSON.parse(
    readFileSync(
      join(__dirname, `../artifacts/contracts/**/${name}.sol/${name}.json`),
      "utf-8"
    )
  );
}

// Resolve artifact even though the path varies by directory layout.
function artifact(contractName: string): { abi: any[]; bytecode: string } {
  const candidatePaths = [
    `../artifacts/contracts/core/${contractName}.sol/${contractName}.json`,
    `../artifacts/contracts/identity/${contractName}.sol/${contractName}.json`,
    `../artifacts/contracts/modules/${contractName}.sol/${contractName}.json`,
    `../artifacts/contracts/governance/${contractName}.sol/${contractName}.json`,
    `../artifacts/contracts/token/${contractName}.sol/${contractName}.json`,
    `../artifacts/contracts/test/${contractName}.sol/${contractName}.json`,
  ];
  for (const rel of candidatePaths) {
    try {
      const parsed = JSON.parse(readFileSync(join(__dirname, rel), "utf-8"));
      return { abi: parsed.abi, bytecode: parsed.bytecode };
    } catch {
      // try next
    }
  }
  throw new Error(`Artifact for ${contractName} not found`);
}

let CACHED_TX_OPTS: { maxPriorityFeePerGas: bigint; maxFeePerGas: bigint } | null = null;

async function initTxOpts(provider: ethers.JsonRpcProvider) {
  const fee = await provider.getFeeData();
  const tip = (fee.maxPriorityFeePerGas ?? ethers.parseUnits("1.5", "gwei")) + PRIORITY_FEE_BUMP;
  const max = (fee.maxFeePerGas ?? ethers.parseUnits("30", "gwei")) + PRIORITY_FEE_BUMP;
  CACHED_TX_OPTS = { maxPriorityFeePerGas: tip, maxFeePerGas: max };
}

function txOpts() {
  if (!CACHED_TX_OPTS) throw new Error("initTxOpts must run first");
  return CACHED_TX_OPTS;
}

async function deploy(
  deployer: ethers.Wallet,
  name: string,
  args: any[]
): Promise<{ address: string; tx: string }> {
  const a = artifact(name);
  const factory = new ethers.ContractFactory(a.abi, a.bytecode, deployer);
  const ct = await factory.deploy(...args, txOpts());
  await ct.waitForDeployment();
  const addr = await ct.getAddress();
  console.log(`✓ ${name.padEnd(22)} ${addr}`);
  return { address: addr, tx: ct.deploymentTransaction()!.hash };
}

async function sendTx(label: string, fn: () => Promise<ethers.TransactionResponse>) {
  console.log(`  → ${label}`);
  const tx = await fn();
  await tx.wait();
}

async function main() {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const deployer = new ethers.Wallet(KEY!, provider);
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance: ",
    ethers.formatEther(await provider.getBalance(deployer.address)),
    "ETH"
  );

  await initTxOpts(provider);

  // ── 1. MockUSDC ─────────────────────────────────────────────────
  const usdc = await deploy(deployer, "MockUSDC", []);

  // ── 2. ConfidentialUSDC ─────────────────────────────────────────
  const cusdc = await deploy(deployer, "ConfidentialUSDC", [
    deployer.address,
    usdc.address,
  ]);

  // ── 3. BidderRegistry ───────────────────────────────────────────
  const registry = await deploy(deployer, "BidderRegistry", [deployer.address]);

  // ── 4. BidEscrow (v7, cUSDC-native) ─────────────────────────────
  const escrow = await deploy(deployer, "BidEscrow", [
    deployer.address,
    cusdc.address,
  ]);

  // ── 5. TenderFactory ────────────────────────────────────────────
  const factory = await deploy(deployer, "TenderFactory", [
    registry.address,
    escrow.address,
  ]);

  // ── 6. DisputeManager ───────────────────────────────────────────
  const dispute = await deploy(deployer, "DisputeManager", [
    escrow.address,
    deployer.address, // municipality stand-in
    registry.address,
  ]);

  // ── 7. ArbitrationSafe ──────────────────────────────────────────
  const arbAddresses = ARBITRATOR_SEEDS.map(arbitrator);
  console.log("Arbitrators (3-of-5):");
  for (let i = 0; i < arbAddresses.length; i++) {
    console.log(`  [${i}] ${ARBITRATOR_SEEDS[i].padEnd(35)} ${arbAddresses[i]}`);
  }
  const arbitration = await deploy(deployer, "ArbitrationSafe", [
    dispute.address,
    arbAddresses,
  ]);

  // ── 8. PriceEscalation ──────────────────────────────────────────
  const escalation = await deploy(deployer, "PriceEscalation", []);

  // ── 9. CollisionDetector ────────────────────────────────────────
  const collision = await deploy(deployer, "CollisionDetector", []);

  // ── Wiring ──────────────────────────────────────────────────────
  console.log("\n--- Wiring ---");
  const registryC = new ethers.Contract(registry.address, artifact("BidderRegistry").abi, deployer);
  const escrowC = new ethers.Contract(escrow.address, artifact("BidEscrow").abi, deployer);
  const disputeC = new ethers.Contract(dispute.address, artifact("DisputeManager").abi, deployer);
  const factoryC = new ethers.Contract(factory.address, artifact("TenderFactory").abi, deployer);
  const escalationC = new ethers.Contract(escalation.address, artifact("PriceEscalation").abi, deployer);

  await sendTx("registry.setTenderManager(factory)", () =>
    registryC.setTenderManager(factory.address, txOpts())
  );
  await sendTx("escrow.authorizeCaller(factory)", () =>
    escrowC.authorizeCaller(factory.address, txOpts())
  );
  await sendTx("escrow.authorizeCaller(disputeManager)", () =>
    escrowC.authorizeCaller(dispute.address, txOpts())
  );
  await sendTx("disputeManager.setCourtAuthority(arbitrationSafe)", () =>
    disputeC.setCourtAuthority(arbitration.address, txOpts())
  );
  await sendTx("factory.setDisputeManager(disputeManager)", () =>
    factoryC.setDisputeManager(dispute.address, txOpts())
  );
  await sendTx("factory.setEscalation(priceEscalation)", () =>
    factoryC.setEscalation(escalation.address, txOpts())
  );
  await sendTx("factory.setCollisionDetector(collisionDetector)", () =>
    factoryC.setCollisionDetector(collision.address, txOpts())
  );
  await sendTx("priceEscalation.setTenderManager(factory)", () =>
    escalationC.setTenderManager(factory.address, txOpts())
  );

  // ── Output ──────────────────────────────────────────────────────
  const out = {
    version: "v7",
    network: "sepolia",
    chainId: 11155111,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      MockUSDC: usdc.address,
      ConfidentialUSDC: cusdc.address,
      BidderRegistry: registry.address,
      BidEscrow: escrow.address,
      TenderFactory: factory.address,
      DisputeManager: dispute.address,
      ArbitrationSafe: arbitration.address,
      PriceEscalation: escalation.address,
      CollisionDetector: collision.address,
    },
    arbitrators: arbAddresses,
  };

  const outPath = join(__dirname, "../deployments/sepolia/v7-cusdc.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("\n✓ Deployment manifest:", outPath);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
