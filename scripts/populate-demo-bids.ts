// Phase 6 of the demo populate: encrypt and submit a real bid to each of
// the three demo tenders, from three deterministic ephemeral wallets, so the
// /tenders/[id] pages and /bids page show non-zero activity on the live demo.
//
// Why a separate script: the Phase 1-5 populate script registered three keccak-
// derived persona addresses (Karadeniz, Anatolia, Otosan) with full reputation
// history, but those addresses have no private key -- we cannot sign bid txs
// from them. This script registers three SECONDARY bidders whose addresses
// derive from `new ethers.Wallet(keccak256(seed))`, so the deployer holds the
// keys, can fund them, and can sign submitBid from each.
//
// What it writes (~30 txs, ~6 min on Sepolia at 4-6 s pacing):
//   1. Fund 3 ephemeral wallets, ~0.004-0.005 ETH each
//   2. registerBidder + light reputation drip (so each clears the
//      tender's minReputation gate)
//   3. For each (bidder, tender) pair:
//        a. BidEscrow.deposit(tenderId, value=escrowAmount)
//        b. Build batched encrypted input: price (u64) + years (u32) +
//           projects (u32) + bond (u64) -- single proof, four handles
//        c. EncryptedTender.submitBid(...)  [FHE-mutating, ~3 M gas]
//
// After this run:
//   - /tenders/1, /tenders/2, /tenders/3 each show "1 bidder"
//   - /bids shows the active bid for whichever bidder wallet you connect with
//   - Etherscan shows real submitBid + EscrowDeposited + BidSubmitted events
//
// Idempotency: re-running silently re-attempts each phase. Already-funded
// wallets skip funding; already-verified bidders skip register/drip;
// already-bid tenders skip submit. Phase order matters (register before drip,
// drip before bid, deposit before submit) -- script enforces it.
//
// Run: npx ts-node --transpile-only scripts/populate-demo-bids.ts
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { ethers } from "ethers";
// node-side relayer SDK has a CJS exit; ts-node CommonJS resolves it via
// the package.json "exports": { "./node": { "require": "./lib/node.cjs" } }.
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";

const SEPOLIA_RPC =
  process.env.POPULATE_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!KEY) throw new Error("DEPLOYER_PRIVATE_KEY missing in .env");

const PACE_MS = 4000;
const FHE_PACE_MS = 6500; // Sepolia coprocessor minimum between FHE-mutating txs
const PRIORITY_FEE_BUMP = ethers.parseUnits("3", "gwei");
const FHE_TX_GAS_LIMIT = 5_000_000n; // submitBid does ~4 FHE.fromExternal + slot
                                     // writes; 5 M is safe vs. ~3 M observed.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ADDRESSES = {
  BidderRegistry: "0x2E8037626102ca3393ab9EfE7a3A254b30B236CA",
  BidEscrow: "0x76FBC67992459E972b80A88e11a5c15B0CFDBD11",
  TenderFactory: "0x617C5414f0b9e2a2c7850d81068FC50138b5c96f",
};

function loadAbi(name: string): any[] {
  return JSON.parse(
    readFileSync(join(__dirname, `../deployments/sepolia/${name}.json`), "utf-8")
  ).abi;
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
          msg.includes("504")) &&
        // Hard-stop classes that LOOK retryable in raw text but are not:
        // a wallet that's broke can't fund itself by retrying, and a revert
        // is deterministic.
        !msg.includes("insufficient funds") &&
        !msg.includes("CALL_EXCEPTION") &&
        !msg.includes("execution reverted");
      if (!transient || attempt === delays.length) throw e;
      console.warn(
        `  [retry ${attempt + 1}/${delays.length}] ${label}: ${msg.slice(0, 140)}`
      );
      await sleep(delays[attempt]);
    }
  }
  throw lastErr;
}

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
    `Gas:    maxFee=${ethers.formatUnits(max, "gwei")} gwei, tip=${ethers.formatUnits(tip, "gwei")} gwei`
  );
}
function txOpts() {
  if (!CACHED_TX_OPTS) throw new Error("initTxOpts must run before txOpts");
  return CACHED_TX_OPTS;
}

interface BidPlan {
  label: string;
  walletSeed: string;
  // Reputation drip counts: tuned so getReputationScore() clears the matching
  // tender's minReputation gate by a comfortable margin.
  bids: number;
  wins: number;
  completions: number;
  // Tender to bid on (1=construction, 2=IT, 3=vehicle).
  tenderId: number;
  // Bid values (matched to each tender's estimated value range and credentials
  // window). uint64 for price/bond, uint32 for years/projects.
  price: bigint;
  years: number;
  projects: number;
  bond: bigint;
}

const PLANS: BidPlan[] = [
  {
    label: "Karadeniz Insaat (bid arm)",
    walletSeed: "sealtender::bid-arm::karadeniz",
    bids: 6,
    wins: 3,
    completions: 2, // (3+2)*100/6 = 83 -> clears construction (>=70)
    tenderId: 1, // Bagcilar Olympic Sports Complex Phase II
    price: 27_500_000_000_000n,    // 27.5 M USDC (within 24-32 M est range)
    years: 12,
    projects: 47,
    bond: 250_000_000_000n,        // 250 K USDC bond
  },
  {
    label: "Anatolia Tech (bid arm)",
    walletSeed: "sealtender::bid-arm::anatolia",
    bids: 4,
    wins: 2,
    completions: 1, // (2+1)*100/4 = 75 -> clears IT (>=65)
    tenderId: 2, // Istanbul Metro SCADA cybersecurity audit
    price: 2_100_000_000_000n,     // 2.1 M USDC (within 1.8-2.4 M est range)
    years: 8,
    projects: 23,
    bond: 80_000_000_000n,         // 80 K USDC
  },
  {
    label: "Otosan Logistics (bid arm)",
    walletSeed: "sealtender::bid-arm::otosan",
    bids: 5,
    wins: 2,
    completions: 2, // (2+2)*100/5 = 80 -> clears vehicle (>=60)
    tenderId: 3, // Municipal fleet renewal Phase I
    price: 3_200_000_000_000n,     // 3.2 M USDC (within 2.9-3.6 M est range)
    years: 9,
    projects: 31,
    bond: 55_000_000_000n,         // 55 K USDC
  },
];

function bidWallet(seed: string, provider: ethers.JsonRpcProvider): ethers.Wallet {
  // Deterministic key: keccak256(utf8(seed)) is a 32-byte value valid as a
  // private key. Re-running the script regenerates the same wallets, so
  // funding + registration + bid persist across invocations.
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
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance: ",
    ethers.formatEther(await provider.getBalance(deployer.address)),
    "ETH"
  );
  console.log("RPC:    ", SEPOLIA_RPC);

  await initTxOpts(provider);
  console.log();

  // ============================================================
  // Phase 6: initialize Zama Relayer SDK
  // ============================================================
  console.log("[Phase 6] Initialize Zama Relayer SDK (Sepolia)");
  const fhe = await withRetry("createInstance", () =>
    createInstance({ ...SepoliaConfig, network: SEPOLIA_RPC })
  );
  console.log("  ready (relayer:", SepoliaConfig.relayerUrl, ")\n");

  const registry = new ethers.Contract(
    ADDRESSES.BidderRegistry,
    loadAbi("BidderRegistry"),
    deployer
  );
  const escrow = new ethers.Contract(
    ADDRESSES.BidEscrow,
    loadAbi("BidEscrow"),
    deployer
  );
  const factory = new ethers.Contract(
    ADDRESSES.TenderFactory,
    loadAbi("TenderFactory"),
    deployer
  );

  const wallets = PLANS.map((p) => bidWallet(p.walletSeed, provider));

  // ============================================================
  // Phase 7: fund ephemeral wallets
  // ============================================================
  console.log("[Phase 7] Fund ephemeral bid wallets");
  for (let i = 0; i < PLANS.length; i++) {
    const plan = PLANS[i];
    const w = wallets[i];
    const bal = await provider.getBalance(w.address);
    // Each wallet needs:
    //   - escrowAmount (max 0.002 ETH for construction tender)
    //   - ~0.0003 ETH deposit gas
    //   - submitBid intrinsic check = maxFeePerGas * gasLimit
    //                              = 3 gwei * 5_000_000 = 0.015 ETH minimum
    //     even though actual gas use is ~3 M (~0.009 ETH).
    //   - safety buffer
    // First run used 0.005 ETH which left wallets short on the intrinsic check.
    // 0.020 ETH covers all three categories uniformly with margin.
    const target = ethers.parseEther("0.020");
    if (bal >= target) {
      console.log(
        `  ${plan.label}: bal=${ethers.formatEther(bal)} ETH (already funded)`
      );
      continue;
    }
    const topup = target - bal;
    console.log(
      `  ${plan.label} (${w.address}): top up by ${ethers.formatEther(topup)} ETH`
    );
    const tx = await paced("fund", PACE_MS, () =>
      deployer.sendTransaction({ to: w.address, value: topup, ...txOpts() })
    );
    const rc = await tx.wait();
    console.log(`    tx=${tx.hash}, gas=${rc!.gasUsed}`);
  }
  console.log();

  // ============================================================
  // Phase 8: register + light reputation drip for ephemeral wallets
  // ============================================================
  console.log("[Phase 8] Register ephemeral bidders + drip reputation");
  for (let i = 0; i < PLANS.length; i++) {
    const plan = PLANS[i];
    const w = wallets[i];
    const verified = await registry.isVerified(w.address);
    if (verified) {
      const sc = await registry.getReputationScore(w.address);
      console.log(
        `  ${plan.label}: already registered (${w.address}), score=${sc}`
      );
      continue;
    }
    console.log(`  ${plan.label}: registering ${w.address}`);
    const txReg = await paced("registerBidder", PACE_MS, () =>
      registry.registerBidder(w.address, txOpts())
    );
    await txReg.wait();
    console.log(`    registered, tx=${txReg.hash}`);

    for (let j = 0; j < plan.bids; j++) {
      await paced(`recordBid #${j}`, PACE_MS, async () =>
        (await registry.recordBid(w.address, txOpts())).wait()
      );
    }
    for (let j = 0; j < plan.wins; j++) {
      await paced(`recordWin #${j}`, PACE_MS, async () =>
        (await registry.recordWin(w.address, txOpts())).wait()
      );
    }
    for (let j = 0; j < plan.completions; j++) {
      await paced(`recordCompletion #${j}`, PACE_MS, async () =>
        (await registry.recordCompletion(w.address, txOpts())).wait()
      );
    }
    const sc = await registry.getReputationScore(w.address);
    const profile = await registry.getProfile(w.address);
    console.log(
      `    final: bids=${profile.totalBids}, wins=${profile.totalWins}, completions=${profile.completedOnTime}, score=${sc}`
    );
  }
  console.log();

  // ============================================================
  // Phase 9: deposit escrow + submit encrypted bid for each (bidder, tender)
  // ============================================================
  console.log("[Phase 9] Deposit escrow + submit encrypted bids");

  const tenderAbi = [
    "function submitBid(bytes32 _encPrice, bytes _priceProof, bytes32 _encYears, bytes _yearsProof, bytes32 _encProjects, bytes _projectsProof, bytes32 _encBond, bytes _bondProof) external",
    "function hasBid(address) external view returns (bool)",
  ];

  for (let i = 0; i < PLANS.length; i++) {
    const plan = PLANS[i];
    const bidder = wallets[i];
    const tenderAddr = await factory.getTender(plan.tenderId);
    if (!tenderAddr || tenderAddr === ethers.ZeroAddress) {
      throw new Error(`tender ${plan.tenderId} not deployed (factory.getTender returned 0)`);
    }
    const required = (await escrow.requiredDeposit(plan.tenderId)) as bigint;
    console.log(
      `  ${plan.label} -> tender ${plan.tenderId} @ ${tenderAddr}, escrow ${ethers.formatEther(required)} ETH`
    );

    const tender = new ethers.Contract(tenderAddr, tenderAbi, bidder);

    // Idempotent skip: if this bidder already has a bid on this tender we
    // simply log and move on.
    const already = await tender.hasBid(bidder.address);
    if (already) {
      console.log("    already bid -- skipping deposit + submit");
      continue;
    }

    // 9a. deposit escrow (signed by bidder; tx pays msg.value=requiredDeposit).
    //     Skip if already deposited from a prior run that died after deposit
    //     but before submitBid (BidEscrow reverts DepositAlreadyExists otherwise).
    const escrowFromBidder = escrow.connect(bidder) as ethers.Contract;
    const existingDep = (await escrow.deposits(
      plan.tenderId,
      bidder.address
    )) as bigint;
    if (existingDep >= required) {
      console.log(
        `    deposit already present (${ethers.formatEther(existingDep)} ETH) -- skipping`
      );
    } else {
      const depTx = await paced("deposit", PACE_MS, () =>
        escrowFromBidder.deposit(plan.tenderId, { value: required, ...txOpts() })
      );
      const depRc = await depTx.wait();
      console.log(`    deposit tx=${depTx.hash}, gas=${depRc!.gasUsed}`);
    }

    // 9b. build batched encrypted input (4 inputs, 1 proof, 4 handles)
    const buf = fhe.createEncryptedInput(tenderAddr, bidder.address);
    buf.add64(plan.price);
    buf.add32(BigInt(plan.years));
    buf.add32(BigInt(plan.projects));
    buf.add64(plan.bond);
    console.log("    encrypting price/years/projects/bond...");
    const enc = await withRetry("buf.encrypt", () => buf.encrypt());
    if (enc.handles.length !== 4) {
      throw new Error(
        `expected 4 handles from batched encrypt, got ${enc.handles.length}`
      );
    }
    const handle = (i: number) => ethers.hexlify(enc.handles[i]);
    const proof = ethers.hexlify(enc.inputProof);
    console.log(
      `    handles[0..3]=[${handle(0).slice(0, 10)}, ${handle(1).slice(0, 10)}, ${handle(2).slice(0, 10)}, ${handle(3).slice(0, 10)}], proof bytes=${enc.inputProof.length}`
    );

    // 9c. submitBid -- single tx with all four (handle, proof) pairs. The
    //     proof is reused across the four FHE.fromExternal calls because
    //     batched encrypt produces ONE proof attesting to all four handles.
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
      `    submitBid tx=${submitTx.hash}, gas=${submitRc!.gasUsed}, status=${submitRc!.status === 1 ? "success" : "FAILED"}`
    );
  }
  console.log();

  // ============================================================
  // Summary
  // ============================================================
  console.log("=== Encrypted bids populate complete ===");
  for (let i = 0; i < PLANS.length; i++) {
    const plan = PLANS[i];
    const tenderAddr = await factory.getTender(plan.tenderId);
    const tender = new ethers.Contract(tenderAddr, tenderAbi, provider);
    const has = await tender.hasBid(wallets[i].address);
    console.log(
      `  tender ${plan.tenderId} (${plan.label.replace(" (bid arm)", "")}): hasBid=${has}`
    );
  }
  console.log(
    `Final deployer balance: ${ethers.formatEther(await provider.getBalance(deployer.address))} ETH`
  );
  console.log("Live: https://frontend-red-mu.vercel.app/");
}

main().catch((e) => {
  console.error("\n[FAIL]", e);
  process.exit(1);
});
