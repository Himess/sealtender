// Populate the v4 governance deployment with 3 production-style tenders + bids
// AND one "expired-deadline" demo tender so the live recording can show the
// permissionless reveal in action.
//
// Why this exists separately from populate-demo-content.ts + populate-demo-bids.ts:
// the v3 populate hit the v3 TenderFactory at 0x617C5414... -- those tenders
// (ids 1/2/3) ran the old onlyOwner reveal path. v4 introduces a brand-new
// TenderFactory at 0x7F6aBdc6... which produces EncryptedTender_v4 instances
// with REVEAL_TIMELOCK + permissionless evaluateBatch / requestReveal. We
// create FRESH tenders against the v4 factory so the demo flow exercises the
// new gating end-to-end.
//
// Wallet reuse: we reuse the three ephemeral bid-arm wallets that the v3
// populate funded + registered (Karadeniz/Anatolia/Otosan bid arms). They are
// already verified bidders on the shared BidderRegistry (registry isn't
// redeployed in v4) and they already have reputation history from v3. So we
// skip "register + drip" and go straight to deposit + encrypt + submitBid.
//
// Output:
//   - Tender 4 (factory_v4 id 0): construction, deadline +14 days, real
//   - Tender 5 (factory_v4 id 1): IT,           deadline +10 days, real
//   - Tender 6 (factory_v4 id 2): vehicle,      deadline +7 days, real
//   - Tender 7 (factory_v4 id 3): SHORT 60-second deadline. Bid submitted
//     immediately. Then we sleep until deadline + REVEAL_TIMELOCK + buffer
//     and call evaluateBatch (permissionlessly) so the tender lands in the
//     EvaluationComplete state. By recording time, requestReveal is callable
//     by ANYONE -- our demo wow moment.
//
// Cost: ~0.06 ETH (4 createTender + 4 deposit + 4 submitBid + 1 evaluateBatch).
//
// Run: npx ts-node --transpile-only scripts/populate-v4.ts
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

// v4 + v3 reuse addresses, loaded from deployments/sepolia/v4.json.
const v4Meta = JSON.parse(
  readFileSync(join(__dirname, "../deployments/sepolia/v4.json"), "utf-8")
);
const ADDRESSES = {
  // v3 (reused unchanged)
  BidderRegistry: v4Meta.v3.BidderRegistry as string,
  BidEscrow: v4Meta.v3.BidEscrow as string,
  PriceEscalation: v4Meta.v3.PriceEscalation as string,
  DisputeManager: v4Meta.v3.DisputeManager as string,
  // v4 (newly deployed)
  TenderFactory_v4: v4Meta.v4.TenderFactory as string,
  ArbitrationSafe: v4Meta.v4.ArbitrationSafe as string,
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
  if (!CACHED_TX_OPTS) throw new Error("initTxOpts must run first");
  return CACHED_TX_OPTS;
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const delays = [3000, 6000, 12000];
  let lastErr: any;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);
      const transient =
        (msg.includes("rate limit") ||
          msg.includes("429") ||
          msg.includes("Too Many Requests") ||
          msg.includes("ETIMEDOUT") ||
          msg.includes("ECONNRESET")) &&
        !msg.includes("insufficient funds") &&
        !msg.includes("execution reverted") &&
        !msg.includes("CALL_EXCEPTION");
      if (!transient || attempt === delays.length) throw e;
      console.warn(`  [retry ${attempt + 1}] ${label}: ${msg.slice(0, 120)}`);
      await sleep(delays[attempt]);
    }
  }
  throw lastErr;
}

// Minimal v3 tender content (matches frontend categoryLabel rules).
function buildTender(category: string, deadlineSec: number) {
  const base = {
    construction: {
      description:
        "Bagcilar Olympic Sports Complex - Civil Works, MEP, Site Prep (Phase II / v4). Awarded by Istanbul Buyuksehir Belediyesi (IBB). v4 governance harden: timelock + permissionless reveal pipeline.",
      weights: { years: 30, projects: 40, bond: 30 },
      mins: { years: 5, projects: 8, bond: 100_000n },
      escrow: ethers.parseEther("0.002"),
      maxBidders: 12n,
      minRep: 70n,
      spec: {
        totalAreaM2: 18_500n,
        valueRange: [24_000_000_000_000n, 32_000_000_000_000n],
        boq: "BoQ-IBB-2026-CIV-0042-v4",
        std: "TS EN 1992-1-1 / ISO 9001:2015 / ISO 45001:2018 / NFPA 13 / ASHRAE 90.1 / TS 500",
        days: 540n,
        liqDmg: 8_500_000_000n,
      },
    },
    it: {
      description:
        "Istanbul Metro - SCADA & OT Cybersecurity Audit, Penetration Testing, Remediation Roadmap (Phase I / v4). Awarded by Metro Istanbul A.S.",
      weights: { years: 25, projects: 35, bond: 40 },
      mins: { years: 4, projects: 5, bond: 50_000n },
      escrow: ethers.parseEther("0.001"),
      maxBidders: 10n,
      minRep: 65n,
      spec: {
        totalAreaM2: 0n,
        valueRange: [1_800_000_000_000n, 2_400_000_000_000n],
        boq: "BoQ-METRO-IST-2026-IT-0011-v4",
        std: "ISO/IEC 27001:2022 / NIST SP 800-82 Rev. 3 / IEC 62443-3-3 / OWASP ASVS 4.0",
        days: 180n,
        liqDmg: 4_200_000_000n,
      },
    },
    vehicle: {
      description:
        "Municipal Fleet Renewal Phase I - 60 vehicles (48 light commercial + 12 medium-duty service trucks) for ISKI / IBB Park ve Bahceler / Yol Bakim. v4.",
      weights: { years: 20, projects: 35, bond: 45 },
      mins: { years: 3, projects: 4, bond: 30_000n },
      escrow: ethers.parseEther("0.0015"),
      maxBidders: 8n,
      minRep: 60n,
      spec: {
        totalAreaM2: 0n,
        valueRange: [2_900_000_000_000n, 3_600_000_000_000n],
        boq: "BoQ-IBB-ISKI-2026-FLEET-0007-v4",
        std: "TS EN 1846 / TS EN 590 / TS ISO 9001:2015 / Euro 6 / R107 / R110",
        days: 120n,
        liqDmg: 1_800_000_000n,
      },
    },
    demo: {
      description:
        "DEMO TENDER (v4 governance) - 60-second deadline. Crafted so the bid window closes during the populate run, REVEAL_TIMELOCK elapses shortly after, and any non-owner can demonstrate permissionless requestReveal live in the recording.",
      weights: { years: 30, projects: 30, bond: 40 },
      mins: { years: 0, projects: 0, bond: 0n },
      escrow: ethers.parseEther("0.0005"),
      maxBidders: 3n,
      minRep: 0n,
      spec: {
        totalAreaM2: 0n,
        valueRange: [1_000_000_000_000n, 2_000_000_000_000n],
        boq: "BoQ-DEMO-V4-PERMISSIONLESS",
        std: "Demo only - production REVEAL_TIMELOCK = 7 days",
        days: 30n,
        liqDmg: 100_000_000n,
      },
    },
  } as const;
  const t = (base as any)[category];
  return {
    config: {
      description: t.description,
      deadline: BigInt(deadlineSec),
      weightYears: t.weights.years,
      weightProjects: t.weights.projects,
      weightBond: t.weights.bond,
      minYears: t.mins.years,
      minProjects: t.mins.projects,
      minBond: t.mins.bond,
      escrowAmount: t.escrow,
      maxBidders: t.maxBidders,
      minReputation: t.minRep,
    },
    spec: {
      category: category === "demo" ? "construction" : category, // frontend label
      totalAreaM2: t.spec.totalAreaM2,
      estimatedValueMin: t.spec.valueRange[0],
      estimatedValueMax: t.spec.valueRange[1],
      boqReference: t.spec.boq,
      standardsReference: t.spec.std,
      completionDays: t.spec.days,
      liquidatedDamages: t.spec.liqDmg,
    },
  };
}

interface BidArm {
  label: string;
  walletSeed: string;
  category: "construction" | "it" | "vehicle" | "demo";
  price: bigint;
  years: number;
  projects: number;
  bond: bigint;
}

const BID_ARMS: BidArm[] = [
  {
    label: "Karadeniz Insaat (bid arm)",
    walletSeed: "sealtender::bid-arm::karadeniz",
    category: "construction",
    price: 27_500_000_000_000n,
    years: 12,
    projects: 47,
    bond: 250_000_000_000n,
  },
  {
    label: "Anatolia Tech (bid arm)",
    walletSeed: "sealtender::bid-arm::anatolia",
    category: "it",
    price: 2_100_000_000_000n,
    years: 8,
    projects: 23,
    bond: 80_000_000_000n,
  },
  {
    label: "Otosan Logistics (bid arm)",
    walletSeed: "sealtender::bid-arm::otosan",
    category: "vehicle",
    price: 3_200_000_000_000n,
    years: 9,
    projects: 31,
    bond: 55_000_000_000n,
  },
  {
    label: "Karadeniz Insaat (demo bid arm)",
    walletSeed: "sealtender::bid-arm::karadeniz", // reuse same wallet for demo tender
    category: "demo",
    price: 1_500_000_000_000n,
    years: 12,
    projects: 47,
    bond: 100_000_000_000n,
  },
];

async function paced<T>(label: string, ms: number, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await withRetry(label, fn);
  const elapsed = Date.now() - start;
  if (elapsed < ms) await sleep(ms - elapsed);
  return result;
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
  console.log("Factory v4:", ADDRESSES.TenderFactory_v4);
  console.log();

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
  // Phase 1: create 4 tenders -- 3 long deadlines + 1 demo (60 s)
  // ============================================================
  console.log("[Phase 1] Create 4 v4 tenders");
  const nowSec = Math.floor(Date.now() / 1000);
  const deadlines: Record<string, number> = {
    construction: nowSec + 14 * 24 * 3600,
    it: nowSec + 10 * 24 * 3600,
    vehicle: nowSec + 7 * 24 * 3600,
    demo: nowSec + 60, // 60 seconds from now -- demo expiry
  };

  const tenders: { category: string; tenderId: bigint; address: string }[] = [];
  for (const cat of ["construction", "it", "vehicle", "demo"] as const) {
    const t = buildTender(cat, deadlines[cat]);
    const tx = await paced(`createTender(${cat})`, PACE_MS, () =>
      factory.createTender(t.config, t.spec, txOpts())
    );
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
    if (!ev) throw new Error(`TenderCreated not emitted for ${cat}`);
    tenders.push({
      category: cat,
      tenderId: ev.args.tenderId,
      address: ev.args.tenderContract,
    });
    console.log(
      `  ${cat.padEnd(13)} tenderId=${ev.args.tenderId} @ ${ev.args.tenderContract}, deadline=${new Date(deadlines[cat] * 1000).toISOString()}`
    );
  }
  console.log();

  const tenderForCat = (cat: string) => tenders.find((t) => t.category === cat)!;

  // ============================================================
  // Phase 2: deposit + encrypted bid for each tender
  // ============================================================
  console.log("[Phase 2] Deposit + encrypted bid for each tender");
  const tenderAbi = [
    "function submitBid(bytes32 _encPrice, bytes _priceProof, bytes32 _encYears, bytes _yearsProof, bytes32 _encProjects, bytes _projectsProof, bytes32 _encBond, bytes _bondProof) external",
    "function hasBid(address) external view returns (bool)",
    "function evaluateBatch(uint256 startIdx, uint256 endIdx) external",
    "function evaluatedCount() external view returns (uint256)",
    "function evaluationComplete() external view returns (bool)",
    "function bidders(uint256) external view returns (address)",
    "function state() external view returns (uint8)",
  ];

  for (const arm of BID_ARMS) {
    const t = tenderForCat(arm.category);
    const bidder = bidWallet(arm.walletSeed, provider);
    console.log(
      `  ${arm.label} -> ${arm.category} (id ${t.tenderId} @ ${t.address})`
    );

    // Top up the bidder if needed (each submit needs ~0.015 ETH for FHE intrinsic).
    const bal = await provider.getBalance(bidder.address);
    const target = ethers.parseEther("0.020");
    if (bal < target) {
      const tx = await paced("fund", PACE_MS, () =>
        deployer.sendTransaction({
          to: bidder.address,
          value: target - bal,
          ...txOpts(),
        })
      );
      await tx.wait();
      console.log(`    funded ${bidder.address} to 0.020 ETH (tx ${tx.hash})`);
    }

    const escrowFromBidder = escrow.connect(bidder) as ethers.Contract;
    const required = (await escrow.requiredDeposit(t.tenderId)) as bigint;
    const existingDep = (await escrow.deposits(t.tenderId, bidder.address)) as bigint;
    if (existingDep < required) {
      const depTx = await paced("deposit", PACE_MS, () =>
        escrowFromBidder.deposit(t.tenderId, { value: required, ...txOpts() })
      );
      await depTx.wait();
      console.log(
        `    deposit ${ethers.formatEther(required)} ETH tx=${depTx.hash}`
      );
    }

    const tender = new ethers.Contract(t.address, tenderAbi, bidder);
    if (await tender.hasBid(bidder.address)) {
      console.log("    already bid -- skipping submit");
      continue;
    }

    const buf = fhe.createEncryptedInput(t.address, bidder.address);
    buf.add64(arm.price);
    buf.add32(BigInt(arm.years));
    buf.add32(BigInt(arm.projects));
    buf.add64(arm.bond);
    const enc = await withRetry("buf.encrypt", () => buf.encrypt());
    const handle = (i: number) => ethers.hexlify(enc.handles[i]);
    const proof = ethers.hexlify(enc.inputProof);
    const submitTx = await paced("submitBid", FHE_PACE_MS, () =>
      tender.submitBid(
        handle(0), proof,
        handle(1), proof,
        handle(2), proof,
        handle(3), proof,
        { gasLimit: FHE_TX_GAS_LIMIT, ...txOpts() }
      )
    );
    const submitRc = await submitTx.wait();
    console.log(
      `    submitBid tx=${submitTx.hash}, gas=${submitRc!.gasUsed}, status=${submitRc!.status === 1 ? "OK" : "FAIL"}`
    );
  }
  console.log();

  // ============================================================
  // Phase 3: wait + evaluateBatch on the demo tender so it lands READY
  //          for permissionless requestReveal in the live recording.
  // ============================================================
  console.log("[Phase 3] Demo tender: wait for deadline + evaluate (permissionless)");
  const demo = tenderForCat("demo");
  const demoAbi = new ethers.Contract(demo.address, tenderAbi, deployer);

  // Wait until deadline (already maybe past, depending on populate duration).
  const block = await provider.getBlock("latest");
  const ts = block!.timestamp;
  const waitUntilDeadline = Math.max(0, deadlines.demo - ts);
  console.log(
    `  current chain ts=${ts}, demo deadline=${deadlines.demo}, sleep ${waitUntilDeadline}s for deadline to pass`
  );
  if (waitUntilDeadline > 0) await sleep((waitUntilDeadline + 5) * 1000);

  // Evaluate the single bid (permissionless -- caller is deployer here, which
  // also happens to be owner; but the contract no longer cares).
  const tx3 = await paced("evaluateBatch(demo)", FHE_PACE_MS, () =>
    demoAbi.evaluateBatch(0, 1, { gasLimit: FHE_TX_GAS_LIMIT, ...txOpts() })
  );
  const rc3 = await tx3.wait();
  console.log(`  evaluateBatch tx=${tx3.hash}, gas=${rc3!.gasUsed}`);
  console.log(
    `  evaluationComplete=${await demoAbi.evaluationComplete()}, state=${await demoAbi.state()} (2 = Evaluating)`
  );

  // ============================================================
  // Persist v4 populate state for the frontend / video script.
  // ============================================================
  const populated = {
    populatedAt: new Date().toISOString(),
    tenders: tenders.map((t) => ({
      category: t.category,
      tenderId: Number(t.tenderId),
      address: t.address,
      deadline: deadlines[t.category],
      deadlineISO: new Date(deadlines[t.category] * 1000).toISOString(),
    })),
    arbitrationSafe: ADDRESSES.ArbitrationSafe,
    factoryV4: ADDRESSES.TenderFactory_v4,
    demoNote:
      "Tender 3 (category=demo) has a 60-second deadline. After deadline + REVEAL_TIMELOCK (60s) any caller can run requestReveal() permissionlessly. Use this to demonstrate the v4 governance change live.",
  };
  writeFileSync(
    join(__dirname, "../deployments/sepolia/v4-populated.json"),
    JSON.stringify(populated, null, 2)
  );

  console.log();
  console.log("=== v4 populate complete ===");
  for (const t of tenders) {
    console.log(`  tender ${t.tenderId} (${t.category}): ${t.address}`);
  }
  console.log("Live: https://sealtender.vercel.app/");
  console.log();
  console.log(
    "Demo trick: tender id",
    tenderForCat("demo").tenderId.toString(),
    "is post-deadline + post-timelock. Connect ANY wallet (non-owner) and call requestReveal() to demonstrate permissionless reveal."
  );
}

main().catch((e) => {
  console.error("\n[FAIL]", e);
  process.exit(1);
});
