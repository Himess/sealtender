// Populate the live Sepolia v3 deployment with realistic government-procurement
// demo content for the bounty submission video / live demo.
//
// What this writes on-chain (~28 txs, ~10 min on Sepolia at 6 s pacing):
//
//   1. Owner self-authorizes deployer as registry caller so we can record
//      reputation history off the canonical tender path.
//   2. Three bidder personas registered via BidderRegistry.registerBidder:
//        - Karadeniz Insaat A.S.       (12 yrs / 47 projects / construction)
//        - Anatolia Tech Solutions     (8 yrs / 23 projects / IT)
//        - Otosan Logistics Ltd.       (9 yrs / 31 projects / vehicle / logistics)
//      Each gets a deterministic ephemeral address (HD-derived from a seed
//      string so re-runs hit the same `bidders[]` slots).
//   3. Each bidder gets a realistic reputation history dripped in via
//      recordBid / recordWin / recordCompletion / recordSlash. Numbers tuned
//      so getReputationScore() lands in the 78-94 range.
//   4. Three tenders created via TenderFactory.createTender, one per category:
//        - Bagcilar Olympic Sports Complex Phase II  (construction)
//        - Istanbul Metro Cybersecurity Audit        (IT)
//        - Municipal Fleet Renewal - Phase I         (vehicle)
//      Each with realistic deadline, BoQ reference, ISO/ASHRAE/NFPA/TS EN
//      standards, completion days, liquidated damages, value range, area.
//   5. One CitizenComplaint filed against the highest-rated bidder so the
//      Disputes page lights up. Stake = 0.0005 ETH.
//
// This script does NOT submit encrypted bids -- that path requires the
// Zama Relayer SDK initialized in Node with three funded ephemeral wallets
// + 6 s pacing per FHE-mutating tx (would add ~40 min and ~0.05 ETH for
// fund-and-bid choreography). Bid count stays at 0 on each tender; the
// frontend renders this as "Be the first to bid -- amounts encrypted".
//
// Idempotency: re-running this script will redo everything. registerBidder
// reverts on duplicate (BidderAlreadyRegistered), so the first failure on
// re-run is intentional. To reset, deploy fresh registry + factory.
//
// Sepolia hardening (matches scripts/onchain-e2e-v3.ts):
//   - SEPOLIA_PACE_MS = 4000 ms between non-FHE txs (avoid mempool reorgs)
//   - +3 gwei priority tip on every tx
//   - Hard fail on first revert; no silent skips.
//
// Run: npx ts-node scripts/populate-demo-content.ts
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { ethers } from "ethers";

// Override SEPOLIA_RPC_URL via env if you have a private endpoint -- but we
// default to publicnode rather than the env value because the user's env was
// pointing at Tenderly's free gateway, which 429s after the *first* call.
// publicnode tolerates the ~70-tx burst this script sends.
const SEPOLIA_RPC =
  process.env.POPULATE_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!KEY) throw new Error("DEPLOYER_PRIVATE_KEY missing in .env");

const PACE_MS = 4000;
const PRIORITY_FEE_BUMP = ethers.parseUnits("3", "gwei");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Generic retry shim for transient RPC errors (429, 5xx, network blips).
// Lets the populate run survive a single rate-limit hiccup without a full
// restart; we re-fetch feeData on each retry so the gas price doesn't go stale.
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
        msg.includes("rate limit") ||
        msg.includes("429") ||
        msg.includes("Too Many Requests") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("ECONNRESET") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("504");
      if (!transient || attempt === delays.length) throw e;
      console.warn(
        `  [retry ${attempt + 1}/${delays.length}] ${label}: ${msg.slice(0, 140)}`
      );
      await sleep(delays[attempt]);
    }
  }
  throw lastErr;
}

const ADDRESSES = {
  BidderRegistry: "0x2E8037626102ca3393ab9EfE7a3A254b30B236CA",
  BidEscrow: "0x76FBC67992459E972b80A88e11a5c15B0CFDBD11",
  PriceEscalation: "0x1CE25ee2D44aDCa3127AD3b3B9e0B6CBd598C012",
  TenderFactory: "0x617C5414f0b9e2a2c7850d81068FC50138b5c96f",
  DisputeManager: "0xEae392E045518CF78FF279Bf4129b9073eB3A5bb",
};

function loadAbi(name: string): any[] {
  return JSON.parse(
    readFileSync(join(__dirname, `../deployments/sepolia/${name}.json`), "utf-8")
  ).abi;
}

// Deterministic personas: address derived from keccak256(seed) so re-runs
// (after a fresh registry redeploy) reproduce the exact bidder slots.
function persona(seed: string): string {
  const k = ethers.keccak256(ethers.toUtf8Bytes(seed));
  return ethers.getAddress("0x" + k.slice(-40));
}

interface Persona {
  name: string;
  address: string;
  // Reputation tuning: counts dripped via record* calls.
  bids: number;
  wins: number;
  completions: number;
  slashes: number;
  // Display-only (frontend reads these from elsewhere; here for log clarity).
  yearsLicensed: number;
  pastProjects: number;
  category: string;
}

// Reputation tuning: numbers picked so getReputationScore() lands at the
// values shown in the comments. We don't drip the *full* number of historical
// bids (which would average ~30) because each call burns ~50 K gas + 4 s pacing
// on Sepolia -- too costly for a demo populate. The displayed totalBids /
// totalWins / completedOnTime are what matters in the UI.
const PERSONAS: Persona[] = [
  {
    name: "Karadeniz Insaat A.S.",
    address: persona("sealtender::demo::karadeniz-insaat-as"),
    bids: 12,
    wins: 8,
    completions: 7, // (8+7)*100 / 12 = 125 -> capped to 100
    slashes: 0,
    yearsLicensed: 12,
    pastProjects: 47,
    category: "construction",
  },
  {
    name: "Anatolia Tech Solutions",
    address: persona("sealtender::demo::anatolia-tech-solutions"),
    bids: 8,
    wins: 5,
    completions: 5, // (5+5)*100 / 8 = 125 -> capped to 100
    slashes: 0,
    yearsLicensed: 8,
    pastProjects: 23,
    category: "it",
  },
  {
    name: "Otosan Logistics Ltd.",
    address: persona("sealtender::demo::otosan-logistics-ltd"),
    bids: 10,
    wins: 5,
    completions: 4, // (5+4)*100 / (10+2*1) = 75
    slashes: 1, // one historical slash -- triggers Disputes page activity
    yearsLicensed: 9,
    pastProjects: 31,
    category: "vehicle",
  },
];

// Tender configs match TenderConfig + TenderSpecification in
// contracts/interfaces/ISealTender.sol exactly.
function tenderForCategory(category: string, deadlineSec: number) {
  const inDays = (d: number) => BigInt(deadlineSec + d * 24 * 3600);

  if (category === "construction") {
    return {
      config: {
        description:
          "Bagcilar Olympic Sports Complex - Civil Works, MEP, and Site Preparation (Phase II). Awarding entity: Istanbul Buyuksehir Belediyesi (IBB). Project requires structural concrete works, mechanical/electrical/plumbing fit-out, fire protection, HVAC, and site preparation across 18,500 m2. Bidders must demonstrate verified ISO 9001, ISO 45001, ISO 14001, and a minimum of 8 comparable Phase-I+ projects delivered on schedule.",
        deadline: inDays(14),
        weightYears: 30,
        weightProjects: 40,
        weightBond: 30,
        minYears: 5,
        minProjects: 8,
        minBond: 100_000n, // 100 K USDC
        escrowAmount: ethers.parseEther("0.002"),
        maxBidders: 12n,
        minReputation: 70n,
      },
      spec: {
        category: "construction",
        totalAreaM2: 18_500n,
        estimatedValueMin: 24_000_000_000_000n, // 24 M USDC (6 decimals)
        estimatedValueMax: 32_000_000_000_000n, // 32 M USDC
        boqReference: "BoQ-IBB-2026-CIV-0042",
        standardsReference:
          "TS EN 1992-1-1 / ISO 9001:2015 / ISO 45001:2018 / NFPA 13 / ASHRAE 90.1 / TS 500",
        completionDays: 540n,
        liquidatedDamages: 8_500_000_000n, // 8,500 USDC/day
      },
    };
  }
  if (category === "it") {
    return {
      config: {
        description:
          "Istanbul Metro - SCADA & OT Cybersecurity Audit, Penetration Testing, and Remediation Roadmap (Phase I). Awarding entity: Metro Istanbul A.S. Scope covers black-box and grey-box testing of metro signalling SCADA, station SCADA, fare collection, and operations control center across 9 lines and 124 stations. Deliverables: NIST 800-82 / IEC 62443 conformance report, executive briefing, 18-month remediation roadmap.",
        deadline: inDays(10),
        weightYears: 25,
        weightProjects: 35,
        weightBond: 40,
        minYears: 4,
        minProjects: 5,
        minBond: 50_000n, // 50 K USDC
        escrowAmount: ethers.parseEther("0.001"),
        maxBidders: 10n,
        minReputation: 65n,
      },
      spec: {
        category: "it",
        totalAreaM2: 0n,
        estimatedValueMin: 1_800_000_000_000n, // 1.8 M USDC
        estimatedValueMax: 2_400_000_000_000n, // 2.4 M USDC
        boqReference: "BoQ-METRO-IST-2026-IT-0011",
        standardsReference:
          "ISO/IEC 27001:2022 / NIST SP 800-82 Rev. 3 / IEC 62443-3-3 / OWASP ASVS 4.0",
        completionDays: 180n,
        liquidatedDamages: 4_200_000_000n, // 4,200 USDC/day
      },
    };
  }
  // vehicle
  return {
    config: {
      description:
        "Municipal Fleet Renewal - Phase I: 48 light commercial vehicles + 12 medium-duty service trucks for Istanbul park & garden, road maintenance, and water-and-sewerage operations. Awarding entity: ISKI / IBB Park ve Bahceler Mudurlugu joint procurement. Bidders must demonstrate verified ISO 9001 and authorized-dealer status for the proposed fleet brand. Minimum 4 comparable municipal fleet deliveries in the last 24 months.",
      deadline: inDays(7),
      weightYears: 20,
      weightProjects: 35,
      weightBond: 45,
      minYears: 3,
      minProjects: 4,
      minBond: 30_000n, // 30 K USDC
      escrowAmount: ethers.parseEther("0.0015"),
      maxBidders: 8n,
      minReputation: 60n,
    },
    spec: {
      category: "vehicle",
      totalAreaM2: 0n,
      estimatedValueMin: 2_900_000_000_000n, // 2.9 M USDC
      estimatedValueMax: 3_600_000_000_000n, // 3.6 M USDC
      boqReference: "BoQ-IBB-ISKI-2026-FLEET-0007",
      standardsReference:
        "TS EN 1846 / TS EN 590 / TS ISO 9001:2015 / Euro 6 / R107 / R110",
      completionDays: 120n,
      liquidatedDamages: 1_800_000_000n, // 1,800 USDC/day
    },
  };
}

async function paced<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await withRetry(label, fn);
  const elapsed = Date.now() - start;
  if (elapsed < PACE_MS) await sleep(PACE_MS - elapsed);
  return result;
}

// Cache feeData once at startup. ~70 tx * getFeeData() per tx is what 429'd
// the previous run on Tenderly. Sepolia gas drift over 5 min is negligible
// for a populate run.
let CACHED_TX_OPTS: { maxPriorityFeePerGas: bigint; maxFeePerGas: bigint } | null =
  null;

async function initTxOpts(provider: ethers.JsonRpcProvider) {
  const fee = await withRetry("getFeeData", () => provider.getFeeData());
  const tip =
    (fee.maxPriorityFeePerGas ?? ethers.parseUnits("1.5", "gwei")) +
    PRIORITY_FEE_BUMP;
  const max =
    (fee.maxFeePerGas ?? ethers.parseUnits("30", "gwei")) + PRIORITY_FEE_BUMP;
  CACHED_TX_OPTS = { maxPriorityFeePerGas: tip, maxFeePerGas: max };
  console.log(
    `Gas:       maxFee=${ethers.formatUnits(max, "gwei")} gwei, tip=${ethers.formatUnits(tip, "gwei")} gwei (cached)`
  );
}

function txOpts() {
  if (!CACHED_TX_OPTS) throw new Error("initTxOpts must run before txOpts");
  return CACHED_TX_OPTS;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const signer = new ethers.Wallet(KEY!, provider);
  const bal = await provider.getBalance(signer.address);
  console.log("Signer:   ", signer.address);
  console.log("Balance:  ", ethers.formatEther(bal), "ETH");
  console.log("RPC:      ", SEPOLIA_RPC);
  console.log("Pacing:   ", PACE_MS, "ms / +3 gwei tip\n");

  if (bal < ethers.parseEther("0.05")) {
    throw new Error("Need at least 0.05 ETH for the full populate run");
  }

  await initTxOpts(provider);
  console.log();

  const registry = new ethers.Contract(
    ADDRESSES.BidderRegistry,
    loadAbi("BidderRegistry"),
    signer
  );
  const factory = new ethers.Contract(
    ADDRESSES.TenderFactory,
    loadAbi("TenderFactory"),
    signer
  );
  const disputeMgr = new ethers.Contract(
    ADDRESSES.DisputeManager,
    loadAbi("DisputeManager"),
    signer
  );

  // ============================================================
  // Phase 1: self-authorize as registry caller
  // ============================================================
  console.log("[Phase 1/5] Authorize deployer as registry caller");
  const alreadyAuth = await registry.authorizedCallers(signer.address);
  if (alreadyAuth) {
    console.log("  already authorized -- skipping");
  } else {
    const tx = await paced("addAuthorizedCaller", async () =>
      registry.addAuthorizedCaller(signer.address, txOpts())
    );
    const rc = await tx.wait();
    console.log(`  authorized, tx=${tx.hash}, gas=${rc.gasUsed}`);
  }
  console.log();

  // ============================================================
  // Phase 2: register 3 bidder personas
  // ============================================================
  console.log("[Phase 2/5] Register bidder personas");
  for (const p of PERSONAS) {
    const verified = await registry.isVerified(p.address);
    if (verified) {
      console.log(`  ${p.name}: already registered (${p.address})`);
      continue;
    }
    const tx = await paced(`register ${p.name}`, async () =>
      registry.registerBidder(p.address, txOpts())
    );
    const rc = await tx.wait();
    console.log(`  ${p.name}`);
    console.log(`    addr=${p.address}, tx=${tx.hash}, gas=${rc.gasUsed}`);
  }
  console.log();

  // ============================================================
  // Phase 3: drip reputation history
  // ============================================================
  console.log("[Phase 3/5] Build reputation history");
  for (const p of PERSONAS) {
    const profileBefore = await registry.getProfile(p.address);
    const alreadyHasHistory = profileBefore.totalBids > 0n;
    if (alreadyHasHistory) {
      const score = await registry.getReputationScore(p.address);
      console.log(
        `  ${p.name}: history exists (bids=${profileBefore.totalBids}, wins=${profileBefore.totalWins}, completions=${profileBefore.completedOnTime}, slashes=${profileBefore.totalSlashes}, score=${score}) -- skipping`
      );
      continue;
    }
    console.log(`  ${p.name}: writing ${p.bids} bids / ${p.wins} wins / ${p.completions} completions / ${p.slashes} slashes`);
    for (let i = 0; i < p.bids; i++) {
      const tx = await paced(`recordBid #${i}`, async () =>
        registry.recordBid(p.address, txOpts())
      );
      await tx.wait();
    }
    for (let i = 0; i < p.wins; i++) {
      const tx = await paced(`recordWin #${i}`, async () =>
        registry.recordWin(p.address, txOpts())
      );
      await tx.wait();
    }
    for (let i = 0; i < p.completions; i++) {
      const tx = await paced(`recordCompletion #${i}`, async () =>
        registry.recordCompletion(p.address, txOpts())
      );
      await tx.wait();
    }
    for (let i = 0; i < p.slashes; i++) {
      const tx = await paced(`recordSlash #${i}`, async () =>
        registry.recordSlash(p.address, txOpts())
      );
      await tx.wait();
    }
    const profileAfter = await registry.getProfile(p.address);
    const score = await registry.getReputationScore(p.address);
    console.log(
      `    final: bids=${profileAfter.totalBids}, wins=${profileAfter.totalWins}, completions=${profileAfter.completedOnTime}, slashes=${profileAfter.totalSlashes}, score=${score}`
    );
  }
  console.log();

  // ============================================================
  // Phase 4: create 3 tenders (one per category)
  // ============================================================
  console.log("[Phase 4/5] Create tenders");
  const nowSec = Math.floor(Date.now() / 1000);
  const createdTenderIds: bigint[] = [];
  for (const persona of PERSONAS) {
    const { config, spec } = tenderForCategory(persona.category, nowSec);
    const tx = await paced(`createTender (${persona.category})`, async () =>
      factory.createTender(config, spec, txOpts())
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
    if (!ev) throw new Error("TenderCreated event not found");
    const tenderId = ev.args.tenderId as bigint;
    const tenderAddr = ev.args.tenderContract as string;
    createdTenderIds.push(tenderId);
    console.log(`  ${persona.category.padEnd(13)} tenderId=${tenderId}, address=${tenderAddr}`);
    console.log(`    description="${config.description.slice(0, 80)}..."`);
    console.log(`    deadline=${new Date(Number(config.deadline) * 1000).toISOString()}, escrow=${ethers.formatEther(config.escrowAmount)} ETH`);
    console.log(`    tx=${tx.hash}, gas=${rc.gasUsed}`);
  }
  console.log();

  // ============================================================
  // Phase 5: file 1 citizen complaint (anti-fraud signal)
  // ============================================================
  console.log("[Phase 5/5] File citizen complaint");
  if (createdTenderIds.length === 0) {
    console.log("  no tenders created this run -- skipping dispute");
  } else {
    const targetTenderId = createdTenderIds[2]; // vehicle tender
    const targetBidder = PERSONAS[2].address; // Otosan
    const reason =
      "Citizen complaint -- Public records via TBMM Bilgi Edinme suggest the bidder previously delivered a fleet to ABB with a 14% spare-parts markup not declared in the tender response. Requesting investigation of the operations declaration filed for tender " +
      targetTenderId.toString() +
      ".";
    const stake = await disputeMgr.CITIZEN_STAKE();
    console.log(`  filing CitizenComplaint against ${targetBidder} on tender ${targetTenderId}`);
    console.log(`    stake = ${ethers.formatEther(stake)} ETH`);
    const opts = txOpts();
    const tx = await paced("fileCitizenComplaint", async () =>
      disputeMgr.fileCitizenComplaint(targetTenderId, targetBidder, reason, {
        ...opts,
        value: stake,
      })
    );
    const rc = await tx.wait();
    const ev = rc.logs
      .map((l: any) => {
        try {
          return disputeMgr.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((p: any) => p?.name === "DisputeFiled");
    const disputeId = ev?.args.disputeId;
    console.log(`  filed disputeId=${disputeId}, tx=${tx.hash}, gas=${rc.gasUsed}`);
  }
  console.log();

  // ============================================================
  // Summary
  // ============================================================
  console.log("=== Populate complete ===");
  console.log("Tender count:        ", await factory.tenderCount());
  console.log("Bidder count:        ", await registry.bidderCount());
  console.log("Dispute count:       ", await disputeMgr.disputeCount());
  console.log("Final balance:       ", ethers.formatEther(await provider.getBalance(signer.address)), "ETH");
  console.log("\nLive at: https://frontend-red-mu.vercel.app/");
}

main().catch((e) => {
  console.error("\n[FAIL]", e);
  process.exit(1);
});
