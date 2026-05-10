// Resume the v4 populate after the prior run reverted on the 4th createTender
// (demo tender deadline got too close to block.timestamp during Phase 1's
// 4-tender sequential creation). Idempotent: skips work already done.
//
// State this script expects on entry (verified via on-chain reads first):
//   - factory_v4.tenderCount() == 3 (construction id 0, IT id 1, vehicle id 2)
//   - 3 ephemeral bid arm wallets registered + reputation history (from v3 runs)
//
// What it does:
//   1. Create the demo tender (id 3) with deadline = chainNow + 300 s. The
//      generous buffer lets all four bids submit before deadline closes.
//   2. For each of the 4 tenders: deposit (skip if already) + encrypted bid
//      (skip if hasBid).
//   3. Sleep until demo deadline + REVEAL_TIMELOCK + 5 s buffer.
//   4. Permissionless evaluateBatch on the demo tender (cranks the FHE
//      comparison + finalizes evaluationComplete=true so the demo is one
//      `requestReveal()` away from showing the wow moment).
//
// Run: npx ts-node --transpile-only scripts/populate-v4-resume.ts
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ethers } from "ethers";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";

const SEPOLIA_RPC =
  process.env.POPULATE_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!KEY) throw new Error("DEPLOYER_PRIVATE_KEY missing in .env");

const PACE_MS = 4000;
const FHE_PACE_MS = 6500;
const PRIORITY_FEE_BUMP = ethers.parseUnits("3", "gwei");
const FHE_TX_GAS_LIMIT = 5_000_000n;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const v4Meta = JSON.parse(
  readFileSync(join(__dirname, "../deployments/sepolia/v4.json"), "utf-8")
);
const ADDRESSES = {
  BidderRegistry: v4Meta.v3.BidderRegistry as string,
  BidEscrow: v4Meta.v3.BidEscrow as string,
  TenderFactory_v4: v4Meta.v4.TenderFactory as string,
};

function loadAbi(name: string): any[] {
  return JSON.parse(
    readFileSync(join(__dirname, `../deployments/sepolia/${name}.json`), "utf-8")
  ).abi;
}

function bidWallet(seed: string, provider: ethers.JsonRpcProvider): ethers.Wallet {
  const k = ethers.keccak256(ethers.toUtf8Bytes(seed));
  return new ethers.Wallet(k, provider);
}

let CACHED_TX_OPTS: { maxPriorityFeePerGas: bigint; maxFeePerGas: bigint } | null =
  null;
async function initTxOpts(provider: ethers.JsonRpcProvider) {
  const fee = await provider.getFeeData();
  const tip =
    (fee.maxPriorityFeePerGas ?? ethers.parseUnits("1.5", "gwei")) +
    PRIORITY_FEE_BUMP;
  const max =
    (fee.maxFeePerGas ?? ethers.parseUnits("30", "gwei")) + PRIORITY_FEE_BUMP;
  CACHED_TX_OPTS = { maxPriorityFeePerGas: tip, maxFeePerGas: max };
}
function txOpts() {
  if (!CACHED_TX_OPTS) throw new Error("init first");
  return CACHED_TX_OPTS;
}

interface BidArm {
  label: string;
  walletSeed: string;
  tenderId: number;
  price: bigint;
  years: number;
  projects: number;
  bond: bigint;
}

const BID_ARMS: BidArm[] = [
  {
    label: "Karadeniz (construction)",
    walletSeed: "sealtender::bid-arm::karadeniz",
    tenderId: 0,
    price: 27_500_000_000_000n,
    years: 12,
    projects: 47,
    bond: 250_000_000_000n,
  },
  {
    label: "Anatolia (IT)",
    walletSeed: "sealtender::bid-arm::anatolia",
    tenderId: 1,
    price: 2_100_000_000_000n,
    years: 8,
    projects: 23,
    bond: 80_000_000_000n,
  },
  {
    label: "Otosan (vehicle)",
    walletSeed: "sealtender::bid-arm::otosan",
    tenderId: 2,
    price: 3_200_000_000_000n,
    years: 9,
    projects: 31,
    bond: 55_000_000_000n,
  },
  {
    label: "Karadeniz (demo)",
    walletSeed: "sealtender::bid-arm::karadeniz",
    tenderId: 3, // created during this script
    price: 1_500_000_000_000n,
    years: 12,
    projects: 47,
    bond: 100_000_000_000n,
  },
];

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

  const fhe = await createInstance({ ...SepoliaConfig, network: SEPOLIA_RPC });

  const factoryAbi = loadAbi("TenderFactory");
  const factory = new ethers.Contract(
    ADDRESSES.TenderFactory_v4,
    factoryAbi,
    deployer
  );
  const escrow = new ethers.Contract(
    ADDRESSES.BidEscrow,
    loadAbi("BidEscrow"),
    deployer
  );

  // ============================================================
  // Step 1: ensure demo tender exists. If tenderCount < 4, create it
  //         with a chain-relative deadline of +300 s (5 min) so all four
  //         bids in Step 2 submit comfortably before deadline closes.
  // ============================================================
  console.log("\n[1/3] Ensure demo tender exists");
  const cnt = (await factory.tenderCount()) as bigint;
  console.log(`  current tenderCount = ${cnt}`);

  if (cnt < 4n) {
    const block = await provider.getBlock("latest");
    const chainNow = block!.timestamp;
    const demoDeadline = chainNow + 300; // 5 min buffer
    console.log(
      `  creating demo tender, deadline = ${demoDeadline} (${new Date(demoDeadline * 1000).toISOString()})`
    );

    const config = {
      description:
        "DEMO TENDER (v4 governance) - 5 minute deadline. Crafted so the bid window closes during the populate run, REVEAL_TIMELOCK (60 s) elapses shortly after, and any non-owner can demonstrate permissionless requestReveal live. Production REVEAL_TIMELOCK target: 7 days.",
      deadline: BigInt(demoDeadline),
      weightYears: 30,
      weightProjects: 30,
      weightBond: 40,
      minYears: 0,
      minProjects: 0,
      minBond: 0n,
      escrowAmount: ethers.parseEther("0.0005"),
      maxBidders: 3n,
      minReputation: 0n,
    };
    const spec = {
      category: "construction",
      totalAreaM2: 0n,
      estimatedValueMin: 1_000_000_000_000n,
      estimatedValueMax: 2_000_000_000_000n,
      boqReference: "BoQ-DEMO-V4-PERMISSIONLESS",
      standardsReference:
        "Demo only - production REVEAL_TIMELOCK = 7 days, this build = 60 s",
      completionDays: 30n,
      liquidatedDamages: 100_000_000n,
    };

    const tx = await factory.createTender(config, spec, txOpts());
    const rc = await tx.wait();
    const ev = rc.logs
      .map((l: any) => {
        try {
          return factory.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((p: any) => p?.name === "TenderCreated");
    if (!ev) throw new Error("TenderCreated event not emitted");
    console.log(
      `  tenderId=${ev.args.tenderId} @ ${ev.args.tenderContract}, tx=${tx.hash}, gas=${rc.gasUsed}`
    );
  } else {
    console.log("  already at 4 tenders -- skipping");
  }
  await sleep(PACE_MS);

  // Resolve all 4 tender addresses freshly from chain.
  const tenderAddrs: string[] = [];
  for (let i = 0; i < 4; i++) {
    tenderAddrs.push(await factory.tenders(i));
  }
  console.log("\nTender addresses:");
  tenderAddrs.forEach((a, i) => console.log(`  id ${i}: ${a}`));

  // ============================================================
  // Step 2: deposit + encrypted bid for each (bidder, tender)
  // ============================================================
  console.log("\n[2/3] Deposit + encrypted bid");
  const tenderAbi = [
    "function submitBid(bytes32 _encPrice, bytes _priceProof, bytes32 _encYears, bytes _yearsProof, bytes32 _encProjects, bytes _projectsProof, bytes32 _encBond, bytes _bondProof) external",
    "function hasBid(address) external view returns (bool)",
    "function evaluateBatch(uint256 startIdx, uint256 endIdx) external",
    "function evaluatedCount() external view returns (uint256)",
    "function evaluationComplete() external view returns (bool)",
    "function bidders(uint256) external view returns (address)",
    "function state() external view returns (uint8)",
    "function getConfig() external view returns ((string description, uint256 deadline, uint32 weightYears, uint32 weightProjects, uint32 weightBond, uint32 minYears, uint32 minProjects, uint64 minBond, uint256 escrowAmount, uint256 maxBidders, uint256 minReputation))",
  ];

  for (const arm of BID_ARMS) {
    const addr = tenderAddrs[arm.tenderId];
    const bidder = bidWallet(arm.walletSeed, provider);
    console.log(`\n  ${arm.label} -> tender ${arm.tenderId} @ ${addr}`);

    // Top up the bidder if needed.
    const bal = await provider.getBalance(bidder.address);
    const target = ethers.parseEther("0.020");
    if (bal < target) {
      const tx = await deployer.sendTransaction({
        to: bidder.address,
        value: target - bal,
        ...txOpts(),
      });
      await tx.wait();
      console.log(
        `    funded ${bidder.address} +${ethers.formatEther(target - bal)} ETH (tx ${tx.hash})`
      );
      await sleep(PACE_MS);
    }

    const required = (await escrow.requiredDeposit(arm.tenderId)) as bigint;
    const existing = (await escrow.deposits(arm.tenderId, bidder.address)) as bigint;
    if (existing < required) {
      const escrowFromBidder = escrow.connect(bidder) as ethers.Contract;
      const depTx = await escrowFromBidder.deposit(arm.tenderId, {
        value: required,
        ...txOpts(),
      });
      await depTx.wait();
      console.log(
        `    deposit ${ethers.formatEther(required)} ETH tx=${depTx.hash}`
      );
      await sleep(PACE_MS);
    } else {
      console.log("    deposit already present, skip");
    }

    const tender = new ethers.Contract(addr, tenderAbi, bidder);
    if (await tender.hasBid(bidder.address)) {
      console.log("    already bid, skip submit");
      continue;
    }

    const buf = fhe.createEncryptedInput(addr, bidder.address);
    buf.add64(arm.price);
    buf.add32(BigInt(arm.years));
    buf.add32(BigInt(arm.projects));
    buf.add64(arm.bond);
    const enc = await buf.encrypt();
    const handle = (i: number) => ethers.hexlify(enc.handles[i]);
    const proof = ethers.hexlify(enc.inputProof);
    const submitTx = await tender.submitBid(
      handle(0), proof,
      handle(1), proof,
      handle(2), proof,
      handle(3), proof,
      { gasLimit: FHE_TX_GAS_LIMIT, ...txOpts() }
    );
    const submitRc = await submitTx.wait();
    console.log(
      `    submitBid tx=${submitTx.hash}, gas=${submitRc!.gasUsed}, status=${submitRc!.status === 1 ? "OK" : "FAIL"}`
    );
    await sleep(FHE_PACE_MS);
  }

  // ============================================================
  // Step 3: wait for demo deadline + REVEAL_TIMELOCK, then permissionless
  //         evaluateBatch so the tender lands READY for live demo.
  // ============================================================
  console.log("\n[3/3] Wait for demo deadline + timelock, then evaluateBatch");
  const demo = new ethers.Contract(tenderAddrs[3], tenderAbi, deployer);
  const cfg = await demo.getConfig();
  const deadline = Number(cfg.deadline);
  const block = await provider.getBlock("latest");
  const chainNow = block!.timestamp;
  // We want deadline AND deadline+REVEAL_TIMELOCK both passed. evaluateBatch
  // requires only deadline passed; permissionless requestReveal needs the
  // additional REVEAL_TIMELOCK. We sleep until deadline+REVEAL_TIMELOCK+5s
  // so that BOTH the script's evaluateBatch call AND the future demo's
  // permissionless requestReveal will succeed.
  const targetTs = deadline + 60 + 5;
  const waitSec = Math.max(0, targetTs - chainNow);
  console.log(
    `  chainNow=${chainNow}, deadline=${deadline}, target (deadline + 60 + 5)=${targetTs}, sleep ${waitSec}s`
  );
  if (waitSec > 0) await sleep(waitSec * 1000);

  if (await demo.evaluationComplete()) {
    console.log("  evaluation already complete, skip");
  } else {
    const tx = await demo.evaluateBatch(0, 1, {
      gasLimit: FHE_TX_GAS_LIMIT,
      ...txOpts(),
    });
    const rc = await tx.wait();
    console.log(`  evaluateBatch tx=${tx.hash}, gas=${rc!.gasUsed}`);
    console.log(
      `  evaluationComplete=${await demo.evaluationComplete()}, state=${await demo.state()} (2=Evaluating)`
    );
  }

  // Persist final state.
  const populated = {
    populatedAt: new Date().toISOString(),
    factoryV4: ADDRESSES.TenderFactory_v4,
    arbitrationSafe: v4Meta.v4.ArbitrationSafe,
    tenders: tenderAddrs.map((a, i) => ({ tenderId: i, address: a })),
    demoTenderId: 3,
    demoNote:
      "Tender 3 has a short deadline + REVEAL_TIMELOCK already elapsed. From the live recording, ANY wallet (non-owner) can call EncryptedTender(tender3).requestReveal() to demonstrate the v4 permissionless reveal pipeline.",
  };
  writeFileSync(
    join(__dirname, "../deployments/sepolia/v4-populated.json"),
    JSON.stringify(populated, null, 2)
  );
  console.log("\n=== v4 populate complete ===");
  for (let i = 0; i < tenderAddrs.length; i++) {
    console.log(`  tender ${i}: ${tenderAddrs[i]}`);
  }
  console.log(
    "\nDemo trick: tender 3 is post-deadline + post-timelock. Connect any non-owner wallet and call requestReveal() to demonstrate the permissionless flow."
  );
}

main().catch((e) => {
  console.error("\n[FAIL]", e);
  process.exit(1);
});
