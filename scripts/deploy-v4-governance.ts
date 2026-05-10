// v4 governance hardening delta deploy (May 10, 2026).
//
// Purpose: layer permissionless reveal + multi-sig dispute resolution onto the
// v3 SealTender deployment WITHOUT redeploying registry / escrow / oracle /
// confidential-USDC. Only two new contracts:
//
//   1. TenderFactory_v4 -- creates EncryptedTender_v4 instances (with the new
//      REVEAL_TIMELOCK + permissionless evaluateBatch / requestReveal /
//      revealWinner). v3 factory + its tenders 1/2/3 keep working unchanged.
//   2. ArbitrationSafe -- 3-of-5 N-of-M dispute resolution gate, wired as
//      DisputeManager.courtAuthority so the existing dispute lifecycle now
//      goes through quorum voting instead of unilateral owner action.
//
// Wiring after deploy:
//   - BidderRegistry.setTenderManager(factory_v4)   -- so v4 tenders can self-
//     authorize on creation. v3 factory loses the manager role; its already-
//     created tenders 1/2/3 stay authorized (BidderRegistry.authorizedCallers
//     is not revoked on manager switch).
//   - BidEscrow.authorizeCaller(factory_v4)         -- so v4 tenders can call
//     setRequiredDeposit + setTenderAddress.
//   - PriceEscalation.setTenderManager(factory_v4)  -- so v4 tenders auto-
//     authorize for setTenderWinner via winnerSink.
//   - DisputeManager.setCourtAuthority(arbitration) -- 3-of-5 quorum can now
//     call resolveDispute via the new modifier path.
//
// Idempotency: re-running this script will deploy fresh v4 instances every
// time. To avoid drift, this is a one-shot. If you re-run, update the deployments
// JSON manually OR archive the old ones with a -previous suffix.
//
// Run: npx ts-node --transpile-only scripts/deploy-v4-governance.ts
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ethers } from "ethers";

const SEPOLIA_RPC =
  process.env.POPULATE_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!KEY) throw new Error("DEPLOYER_PRIVATE_KEY missing in .env");

// v3 already-deployed addresses (from deployments/sepolia/).
const V3 = {
  BidderRegistry: "0x2E8037626102ca3393ab9EfE7a3A254b30B236CA",
  BidEscrow: "0x76FBC67992459E972b80A88e11a5c15B0CFDBD11",
  PriceEscalation: "0x1CE25ee2D44aDCa3127AD3b3B9e0B6CBd598C012",
  DisputeManager: "0xEae392E045518CF78FF279Bf4129b9073eB3A5bb",
};

// 5 deterministic arbitrator addresses (3-of-5 threshold). Derived from
// keccak256(seed) so the demo has stable, recoverable identities.
const ARBITRATOR_SEEDS = [
  "sealtender::arbitrator::kik-seat",       // Kamu Ihale Kurumu seat
  "sealtender::arbitrator::idari-mahkeme",  // Idari Mahkeme seat
  "sealtender::arbitrator::sektor-1",       // Sector representative #1
  "sealtender::arbitrator::sektor-2",       // Sector representative #2
  "sealtender::arbitrator::stk",            // NGO/civil society seat
];

function arbitrator(seed: string): string {
  const k = ethers.keccak256(ethers.toUtf8Bytes(seed));
  return ethers.getAddress("0x" + k.slice(-40));
}

function loadArtifact(name: string): { abi: any[]; bytecode: string } {
  // hardhat compile dumps to artifacts/contracts/<path>/<Name>.sol/<Name>.json
  const artifactPaths = [
    `artifacts/contracts/core/${name}.sol/${name}.json`,
    `artifacts/contracts/governance/${name}.sol/${name}.json`,
    `artifacts/contracts/identity/${name}.sol/${name}.json`,
    `artifacts/contracts/modules/${name}.sol/${name}.json`,
    `artifacts/contracts/${name}.sol/${name}.json`,
  ];
  for (const p of artifactPaths) {
    try {
      const raw = readFileSync(join(__dirname, "..", p), "utf-8");
      const j = JSON.parse(raw);
      return { abi: j.abi, bytecode: j.bytecode };
    } catch {
      continue;
    }
  }
  throw new Error(`Could not locate artifact for ${name}`);
}

function loadAbi(name: string): any[] {
  return JSON.parse(
    readFileSync(join(__dirname, `../deployments/sepolia/${name}.json`), "utf-8")
  ).abi;
}

const PRIORITY_FEE_BUMP = ethers.parseUnits("3", "gwei");
async function txOpts(provider: ethers.JsonRpcProvider) {
  const fee = await provider.getFeeData();
  return {
    maxPriorityFeePerGas:
      (fee.maxPriorityFeePerGas ?? ethers.parseUnits("1.5", "gwei")) +
      PRIORITY_FEE_BUMP,
    maxFeePerGas:
      (fee.maxFeePerGas ?? ethers.parseUnits("30", "gwei")) + PRIORITY_FEE_BUMP,
  };
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
  console.log("RPC:    ", SEPOLIA_RPC, "\n");

  const arbitrators = ARBITRATOR_SEEDS.map(arbitrator);
  console.log("Arbitrators (3-of-5 threshold):");
  ARBITRATOR_SEEDS.forEach((s, i) => console.log(`  ${i}: ${arbitrators[i]}  (${s})`));
  console.log();

  const opts = await txOpts(provider);

  // ============================================================
  // Step 1: deploy TenderFactory_v4
  // ============================================================
  console.log("[1/5] Deploy TenderFactory v4...");
  const factoryArtifact = loadArtifact("TenderFactory");
  const FactoryF = new ethers.ContractFactory(
    factoryArtifact.abi,
    factoryArtifact.bytecode,
    deployer
  );
  const factory = await FactoryF.deploy(V3.BidderRegistry, V3.BidEscrow, opts);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  const factoryDeployTx = factory.deploymentTransaction()!;
  console.log(`  factory_v4 = ${factoryAddr}`);
  console.log(`  tx = ${factoryDeployTx.hash}\n`);

  // ============================================================
  // Step 2: deploy ArbitrationSafe
  // ============================================================
  console.log("[2/5] Deploy ArbitrationSafe...");
  const safeArtifact = loadArtifact("ArbitrationSafe");
  const SafeF = new ethers.ContractFactory(
    safeArtifact.abi,
    safeArtifact.bytecode,
    deployer
  );
  const safe = await SafeF.deploy(V3.DisputeManager, arbitrators, opts);
  await safe.waitForDeployment();
  const safeAddr = await safe.getAddress();
  const safeDeployTx = safe.deploymentTransaction()!;
  console.log(`  arbitration_safe = ${safeAddr}`);
  console.log(`  tx = ${safeDeployTx.hash}\n`);

  // ============================================================
  // Step 3: wire BidderRegistry.setTenderManager(factory_v4)
  // ============================================================
  console.log("[3/5] Wire BidderRegistry.setTenderManager(factory_v4)...");
  const registry = new ethers.Contract(
    V3.BidderRegistry,
    loadAbi("BidderRegistry"),
    deployer
  );
  const tx3 = await registry.setTenderManager(factoryAddr, opts);
  await tx3.wait();
  console.log(`  tx = ${tx3.hash}\n`);

  // ============================================================
  // Step 4: wire BidEscrow + PriceEscalation for factory_v4
  // ============================================================
  console.log("[4/5] Wire BidEscrow.authorizeCaller(factory_v4) + PriceEscalation.setTenderManager...");
  const escrow = new ethers.Contract(V3.BidEscrow, loadAbi("BidEscrow"), deployer);
  const escalation = new ethers.Contract(
    V3.PriceEscalation,
    loadAbi("PriceEscalation"),
    deployer
  );
  const tx4a = await escrow.authorizeCaller(factoryAddr, opts);
  await tx4a.wait();
  console.log(`  escrow.authorizeCaller(factory_v4) tx = ${tx4a.hash}`);
  const tx4b = await escalation.setTenderManager(factoryAddr, opts);
  await tx4b.wait();
  console.log(`  escalation.setTenderManager(factory_v4) tx = ${tx4b.hash}`);
  // Also point factory at escalation/dispute/collision (factory createTender uses these).
  const factoryC = new ethers.Contract(factoryAddr, factoryArtifact.abi, deployer);
  const tx4c = await factoryC.setEscalation(V3.PriceEscalation, opts);
  await tx4c.wait();
  console.log(`  factory_v4.setEscalation tx = ${tx4c.hash}`);
  const tx4d = await factoryC.setDisputeManager(V3.DisputeManager, opts);
  await tx4d.wait();
  console.log(`  factory_v4.setDisputeManager tx = ${tx4d.hash}\n`);

  // ============================================================
  // Step 5: wire DisputeManager.setCourtAuthority(safe)
  // ============================================================
  console.log("[5/5] Wire DisputeManager.setCourtAuthority(arbitration_safe)...");
  const disputeMgr = new ethers.Contract(
    V3.DisputeManager,
    loadAbi("DisputeManager"),
    deployer
  );
  const tx5 = await disputeMgr.setCourtAuthority(safeAddr, opts);
  await tx5.wait();
  console.log(`  tx = ${tx5.hash}\n`);

  // ============================================================
  // Persist v4 addresses + arbitrator roster for the populate script
  // and frontend to consume.
  // ============================================================
  const out = {
    deployedAt: new Date().toISOString(),
    chain: "sepolia",
    chainId: 11155111,
    deployer: deployer.address,
    v3: V3,
    v4: {
      TenderFactory: factoryAddr,
      ArbitrationSafe: safeAddr,
    },
    arbitrators: arbitrators.map((addr, i) => ({
      seat: ARBITRATOR_SEEDS[i],
      address: addr,
    })),
    notes: [
      "v4 = governance hardening only. v3 contracts (registry/escrow/oracle/cUSDC/disputes) reused.",
      "EncryptedTender_v4 bytecode is identical with v3 except for: REVEAL_TIMELOCK constant + permissionless evaluateBatch + permissionless requestReveal/revealWinner + new RevealTimelockNotElapsed error + PermissionlessRevealTriggered event.",
      "ArbitrationSafe.THRESHOLD = 3 of 5. Resolution requires three independent arbitrator votes for the same (disputeId, resolution) tuple.",
    ],
  };

  const outPath = join(__dirname, "../deployments/sepolia/v4.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("=== v4 governance deploy complete ===");
  console.log("Wrote:", outPath);
  console.log();
  console.log("Summary:");
  console.log("  TenderFactory_v4 :", factoryAddr);
  console.log("  ArbitrationSafe  :", safeAddr);
  console.log("  Arbitrators (3/5):");
  arbitrators.forEach((a, i) =>
    console.log(`    ${i}: ${a}  (${ARBITRATOR_SEEDS[i]})`)
  );
}

main().catch((e) => {
  console.error("\n[FAIL]", e);
  process.exit(1);
});
