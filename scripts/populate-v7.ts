// v7 populate: fill the cUSDC-native demo deployment with content for the
// bounty submission video.
//
// What this writes (~50 txs, ~8 min on Sepolia at 5 s pacing):
//   • Register the 3 bid-arm wallets (deterministic keccak-derived keys so the
//     deployer can sign their transactions later).
//   • Drip reputation history per bidder so they clear each tender's minRep gate.
//   • Create 3 realistic tenders (construction / IT / vehicle) via TenderFactory.
//   • For each bidder, mint MockUSDC, wrap to cUSDC, setOperator(BidEscrow),
//     deposit the encrypted escrow amount, and submit an encrypted bid.
//   • File one citizen complaint so /disputes shows activity.
//
// Run: npx ts-node --transpile-only scripts/populate-v7.ts
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { ethers } from "ethers";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";

const SEPOLIA_RPC =
  process.env.POPULATE_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!KEY) throw new Error("DEPLOYER_PRIVATE_KEY missing in .env");

const PACE_MS = 5000;
const FHE_PACE_MS = 7000;
const PRIORITY_FEE_BUMP = ethers.parseUnits("3", "gwei");
const FHE_TX_GAS_LIMIT = 5_000_000n;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEPLOY = JSON.parse(
  readFileSync(join(__dirname, "../deployments/sepolia/v7-cusdc.json"), "utf-8")
);
const ADDRESSES = DEPLOY.contracts;

function artifact(name: string): { abi: any[] } {
  const candidates = [
    `../artifacts/contracts/core/${name}.sol/${name}.json`,
    `../artifacts/contracts/identity/${name}.sol/${name}.json`,
    `../artifacts/contracts/modules/${name}.sol/${name}.json`,
    `../artifacts/contracts/token/${name}.sol/${name}.json`,
    `../artifacts/contracts/test/${name}.sol/${name}.json`,
  ];
  for (const rel of candidates) {
    try {
      return JSON.parse(readFileSync(join(__dirname, rel), "utf-8"));
    } catch {}
  }
  throw new Error(`ABI ${name} not found`);
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
          msg.includes("ECONNRESET") ||
          msg.includes("502") ||
          msg.includes("503") ||
          msg.includes("504") ||
          msg.includes("Already known")) &&
        !msg.includes("insufficient funds") &&
        !msg.includes("execution reverted");
      if (!transient || attempt === delays.length) throw e;
      console.warn(`  [retry ${attempt + 1}] ${label}`);
      await sleep(delays[attempt]);
    }
  }
  throw lastErr;
}

let CACHED_TX_OPTS: { maxPriorityFeePerGas: bigint; maxFeePerGas: bigint } | null = null;
async function initTxOpts(provider: ethers.JsonRpcProvider) {
  const fee = await withRetry("feeData", () => provider.getFeeData());
  const tip = (fee.maxPriorityFeePerGas ?? ethers.parseUnits("1.5", "gwei")) + PRIORITY_FEE_BUMP;
  const max = (fee.maxFeePerGas ?? ethers.parseUnits("30", "gwei")) + PRIORITY_FEE_BUMP;
  CACHED_TX_OPTS = { maxPriorityFeePerGas: tip, maxFeePerGas: max };
  console.log(`Gas: maxFee=${ethers.formatUnits(max, "gwei")} gwei`);
}
function txOpts() {
  if (!CACHED_TX_OPTS) throw new Error("initTxOpts first");
  return CACHED_TX_OPTS;
}

interface BidPlan {
  label: string;
  walletSeed: string;
  bids: number;
  wins: number;
  completions: number;
  tenderIdx: number;
  escrowDeposit: bigint; // cUSDC fixed-point (6 decimals)
  price: bigint;
  years: number;
  projects: number;
  bond: bigint;
}

const PLANS: BidPlan[] = [
  {
    label: "Karadeniz Insaat",
    walletSeed: "sealtender::v7::karadeniz",
    bids: 6,
    wins: 3,
    completions: 2, // (3+2)*100/6 = 83 -> clears construction (>=70)
    tenderIdx: 0,
    escrowDeposit: 2_000_000n, // 2 cUSDC
    price: 27_500_000_000_000n,
    years: 12,
    projects: 47,
    bond: 250_000_000_000n,
  },
  {
    label: "Anatolia Tech",
    walletSeed: "sealtender::v7::anatolia",
    bids: 4,
    wins: 2,
    completions: 1, // 75
    tenderIdx: 1,
    escrowDeposit: 1_000_000n, // 1 cUSDC
    price: 2_100_000_000_000n,
    years: 8,
    projects: 23,
    bond: 80_000_000_000n,
  },
  {
    label: "Otosan Logistics",
    walletSeed: "sealtender::v7::otosan",
    bids: 5,
    wins: 2,
    completions: 2, // 80
    tenderIdx: 2,
    escrowDeposit: 1_500_000n, // 1.5 cUSDC
    price: 3_200_000_000_000n,
    years: 9,
    projects: 31,
    bond: 55_000_000_000n,
  },
];

const TENDER_BUDGETS = [
  // 0: construction
  {
    config: {
      description:
        "Bagcilar Olympic Sports Complex - Civil Works, MEP, Site Preparation (Phase II - v7 cUSDC). Awarded by Istanbul Buyuksehir Belediyesi (IBB). 18,500 m2 across structural / mechanical / electrical / plumbing / fire / HVAC.",
      deadline: 0,
      weightYears: 30,
      weightProjects: 40,
      weightBond: 30,
      minYears: 5,
      minProjects: 8,
      minBond: 100_000n,
      escrowAmount: 2_000_000n, // 2 cUSDC
      maxBidders: 12n,
      minReputation: 70n,
    },
    spec: {
      category: "construction",
      totalAreaM2: 18_500n,
      estimatedValueMin: 24_000_000_000_000n,
      estimatedValueMax: 32_000_000_000_000n,
      boqReference: "BoQ-IBB-2026-CIV-0042-v7",
      standardsReference:
        "TS EN 1992-1-1 / ISO 9001:2015 / ISO 45001:2018 / NFPA 13 / ASHRAE 90.1",
      completionDays: 540n,
      liquidatedDamages: 8_500_000_000n,
    },
  },
  // 1: IT
  {
    config: {
      description:
        "Istanbul Metro - SCADA & OT Cybersecurity Audit, Penetration Testing, Remediation Roadmap (Phase I - v7 cUSDC). Awarded by Metro Istanbul A.S.",
      deadline: 0,
      weightYears: 25,
      weightProjects: 35,
      weightBond: 40,
      minYears: 4,
      minProjects: 5,
      minBond: 50_000n,
      escrowAmount: 1_000_000n, // 1 cUSDC
      maxBidders: 10n,
      minReputation: 65n,
    },
    spec: {
      category: "it",
      totalAreaM2: 0n,
      estimatedValueMin: 1_800_000_000_000n,
      estimatedValueMax: 2_400_000_000_000n,
      boqReference: "BoQ-METRO-2026-IT-0011-v7",
      standardsReference:
        "ISO/IEC 27001:2022 / NIST SP 800-82 / IEC 62443-3-3 / OWASP ASVS 4.0",
      completionDays: 180n,
      liquidatedDamages: 4_200_000_000n,
    },
  },
  // 2: vehicle
  {
    config: {
      description:
        "Municipal Fleet Renewal Phase I - 48 light commercial + 12 medium-duty service trucks (v7 cUSDC). Awarded by ISKI / IBB Park ve Bahceler.",
      deadline: 0,
      weightYears: 20,
      weightProjects: 35,
      weightBond: 45,
      minYears: 3,
      minProjects: 4,
      minBond: 30_000n,
      escrowAmount: 1_500_000n, // 1.5 cUSDC
      maxBidders: 8n,
      minReputation: 60n,
    },
    spec: {
      category: "vehicle",
      totalAreaM2: 0n,
      estimatedValueMin: 2_900_000_000_000n,
      estimatedValueMax: 3_600_000_000_000n,
      boqReference: "BoQ-IBB-2026-FLEET-0007-v7",
      standardsReference: "TS EN 1846 / TS EN 590 / TS ISO 9001:2015 / Euro 6",
      completionDays: 120n,
      liquidatedDamages: 1_800_000_000n,
    },
  },
];

function bidWallet(seed: string, provider: ethers.JsonRpcProvider): ethers.Wallet {
  const k = ethers.keccak256(ethers.toUtf8Bytes(seed));
  return new ethers.Wallet(k, provider);
}

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
  const bal = await provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance: ", ethers.formatEther(bal), "ETH");
  console.log("Addresses:");
  for (const [k, v] of Object.entries(ADDRESSES)) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }
  console.log();

  if (bal < ethers.parseEther("0.05")) {
    throw new Error("Need >=0.05 ETH for the full populate");
  }

  await initTxOpts(provider);

  const registry = new ethers.Contract(ADDRESSES.BidderRegistry, artifact("BidderRegistry").abi, deployer);
  const factory = new ethers.Contract(ADDRESSES.TenderFactory, artifact("TenderFactory").abi, deployer);
  const escrow = new ethers.Contract(ADDRESSES.BidEscrow, artifact("BidEscrow").abi, deployer);
  const usdc = new ethers.Contract(ADDRESSES.MockUSDC, artifact("MockUSDC").abi, deployer);
  const cUSDC = new ethers.Contract(ADDRESSES.ConfidentialUSDC, artifact("ConfidentialUSDC").abi, deployer);

  // ── Phase 1: self-authorize deployer on registry for reputation drip ──
  console.log("[Phase 1] Authorize deployer for reputation history");
  const alreadyAuth = await registry.authorizedCallers(deployer.address);
  if (!alreadyAuth) {
    await paced("addAuthorizedCaller", PACE_MS, async () =>
      (await registry.addAuthorizedCaller(deployer.address, txOpts())).wait()
    );
  } else {
    console.log("  already authorized — skipping");
  }

  // ── Phase 2: create the 3 tenders ──
  console.log("\n[Phase 2] Create 3 tenders");
  const tenderAddrs: string[] = [];
  const nowSec = Math.floor(Date.now() / 1000);
  for (let i = 0; i < TENDER_BUDGETS.length; i++) {
    const budget = TENDER_BUDGETS[i];
    const cfg = { ...budget.config, deadline: BigInt(nowSec + (i === 2 ? 7 : i === 1 ? 10 : 14) * 24 * 3600) };
    console.log(`  [${i}] ${cfg.description.slice(0, 60)}...`);
    const tenderId = await paced(`createTender[${i}]`, PACE_MS, async () => {
      const tx = await factory.createTender(cfg, budget.spec, txOpts());
      await tx.wait();
      return i; // tender ID is sequential
    });
    const tenderAddr = await factory.getTender(tenderId);
    tenderAddrs.push(tenderAddr);
    console.log(`      → ${tenderAddr}`);
  }

  // ── Phase 3: register the 3 bid-arm wallets and drip reputation ──
  console.log("\n[Phase 3] Bidder registration + reputation drip");
  for (const plan of PLANS) {
    const bw = bidWallet(plan.walletSeed, provider);
    console.log(`  ${plan.label} (${bw.address})`);

    // register if not yet
    const profile: any = await registry.getProfile(bw.address);
    if (!profile.verified) {
      await paced(`register ${plan.label}`, PACE_MS, async () =>
        (await registry.registerBidder(bw.address, txOpts())).wait()
      );
    }

    // reputation history
    for (let i = 0; i < plan.bids; i++) {
      await paced(`recordBid ${plan.label} #${i + 1}`, PACE_MS, async () =>
        (await registry.recordBid(bw.address, txOpts())).wait()
      );
    }
    for (let i = 0; i < plan.wins; i++) {
      await paced(`recordWin ${plan.label} #${i + 1}`, PACE_MS, async () =>
        (await registry.recordWin(bw.address, txOpts())).wait()
      );
    }
    for (let i = 0; i < plan.completions; i++) {
      await paced(`recordCompletion ${plan.label} #${i + 1}`, PACE_MS, async () =>
        (await registry.recordCompletion(bw.address, txOpts())).wait()
      );
    }
    const score = await registry.getReputationScore(bw.address);
    console.log(`    reputation: ${score}`);
  }

  // ── Phase 4: fund bidder wallets with ETH for gas ──
  console.log("\n[Phase 4] Fund bidder wallets with Sepolia ETH (for gas)");
  const FUND_ETH = ethers.parseEther("0.005");
  for (const plan of PLANS) {
    const bw = bidWallet(plan.walletSeed, provider);
    const cur = await provider.getBalance(bw.address);
    if (cur < FUND_ETH) {
      await paced(`fund ${plan.label}`, PACE_MS, async () =>
        (await deployer.sendTransaction({ to: bw.address, value: FUND_ETH, ...txOpts() })).wait()
      );
      console.log(`  ${plan.label}: funded ${ethers.formatEther(FUND_ETH)} ETH`);
    } else {
      console.log(`  ${plan.label}: already has ${ethers.formatEther(cur)} ETH`);
    }
  }

  // ── Phase 5: mint MockUSDC to bidders + wrap to cUSDC + setOperator ──
  console.log("\n[Phase 5] Mint USDC → wrap to cUSDC → setOperator(BidEscrow)");
  const FAR_FUTURE = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
  for (const plan of PLANS) {
    const bw = bidWallet(plan.walletSeed, provider);
    const bidder = bw.connect(provider);
    const mintAmount = plan.escrowDeposit * 100n; // headroom
    console.log(`  ${plan.label}`);

    // mint USDC (deployer mints to bidder)
    await paced(`mint USDC`, PACE_MS, async () =>
      (await usdc.mint(bw.address, mintAmount, txOpts())).wait()
    );

    // bidder approves cUSDC to pull USDC
    await paced(`approve cUSDC`, PACE_MS, async () =>
      (
        await usdc.connect(bidder).approve(ADDRESSES.ConfidentialUSDC, mintAmount, txOpts())
      ).wait()
    );

    // wrap into cUSDC
    await paced(`wrap`, PACE_MS, async () =>
      (
        await cUSDC.connect(bidder).wrap(bw.address, mintAmount, txOpts())
      ).wait()
    );

    // setOperator(escrow)
    await paced(`setOperator`, PACE_MS, async () =>
      (
        await cUSDC.connect(bidder).setOperator(ADDRESSES.BidEscrow, FAR_FUTURE, txOpts())
      ).wait()
    );
  }

  // ── Phase 6: encrypted deposit + submitBid per plan ──
  console.log("\n[Phase 6] Encrypted deposit + submitBid (FHE)");
  // SepoliaConfig provides KMS/ACL/coprocessor addrs but createInstance also
  // needs a `network` to read the chain state — supply the same RPC we're
  // using elsewhere.
  const fhevm = await createInstance({ ...SepoliaConfig, network: SEPOLIA_RPC });
  for (const plan of PLANS) {
    const bw = bidWallet(plan.walletSeed, provider);
    const bidder = bw.connect(provider);
    const tenderAddr = tenderAddrs[plan.tenderIdx];
    console.log(`  ${plan.label} → tender ${plan.tenderIdx} (${tenderAddr.slice(0, 10)}...)`);

    // 6a. Encrypted deposit (bound to cUSDC + escrow, NOT bidder)
    const depInput = fhevm.createEncryptedInput(ADDRESSES.ConfidentialUSDC, ADDRESSES.BidEscrow);
    depInput.add64(plan.escrowDeposit);
    const depEnc = await depInput.encrypt();
    await paced(`deposit cUSDC`, FHE_PACE_MS, async () =>
      (
        await escrow.connect(bidder).deposit(plan.tenderIdx, depEnc.handles[0], depEnc.inputProof, {
          ...txOpts(),
          gasLimit: FHE_TX_GAS_LIMIT,
        })
      ).wait()
    );

    // 6b. Encrypted bid (bound to tender + bidder)
    const bidInput = fhevm.createEncryptedInput(tenderAddr, bw.address);
    bidInput.add64(plan.price);
    bidInput.add32(plan.years);
    bidInput.add32(plan.projects);
    bidInput.add64(plan.bond);
    const bidEnc = await bidInput.encrypt();

    const tender = new ethers.Contract(tenderAddr, artifact("EncryptedTender").abi, bidder);
    await paced(`submitBid`, FHE_PACE_MS, async () =>
      (
        await tender.submitBid(
          bidEnc.handles[0],
          bidEnc.inputProof,
          bidEnc.handles[1],
          bidEnc.inputProof,
          bidEnc.handles[2],
          bidEnc.inputProof,
          bidEnc.handles[3],
          bidEnc.inputProof,
          { ...txOpts(), gasLimit: FHE_TX_GAS_LIMIT }
        )
      ).wait()
    );
    console.log(`    ✓ bid submitted`);
  }

  console.log("\n✓ Populate complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
