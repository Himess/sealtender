// Create a fresh demo tender (id 4) with a generous 30-min deadline so bid
// + deadline elapse + REVEAL_TIMELOCK fits comfortably inside the day-of-demo
// window. The previous demo tender (id 3) burned its deadline during retries
// and is now bidless+post-deadline -- useless for the permissionless reveal
// showcase.
//
// Sequence (~5 min total):
//   1. createTender (deadline = chainNow + 1800 s = 30 min)
//   2. Karadeniz bid arm submits encrypted bid IMMEDIATELY (well within the
//      30-min window, escrow=0.0005 ETH, minRep=0 so any bidder works)
//   3. Sleep until deadline + REVEAL_TIMELOCK (60 s) + buffer
//   4. evaluateBatch(0, 1) -- permissionless, lands tender in
//      EvaluationComplete state ready for live-recording requestReveal demo
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ethers } from "ethers";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";

const SEPOLIA_RPC =
  process.env.POPULATE_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!KEY) throw new Error("DEPLOYER_PRIVATE_KEY missing in .env");

const FACTORY_V4 = "0x7F6aBdc673557Df490DE7f1B007eceDeeAEb4061";
const ESCROW = "0x76FBC67992459E972b80A88e11a5c15B0CFDBD11";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadAbi(name: string): any[] {
  return JSON.parse(
    readFileSync(join(__dirname, `../deployments/sepolia/${name}.json`), "utf-8")
  ).abi;
}

function bidWallet(seed: string, provider: ethers.JsonRpcProvider): ethers.Wallet {
  const k = ethers.keccak256(ethers.toUtf8Bytes(seed));
  return new ethers.Wallet(k, provider);
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
    "ETH\n"
  );

  const factoryAbi = loadAbi("TenderFactory");
  const factory = new ethers.Contract(FACTORY_V4, factoryAbi, deployer);
  const escrow = new ethers.Contract(ESCROW, loadAbi("BidEscrow"), deployer);

  // ----------------------------------------------------------
  // Step 1: create demo tender id 4 with 30-min deadline
  // ----------------------------------------------------------
  const block = await provider.getBlock("latest");
  const chainNow = block!.timestamp;
  const deadline = chainNow + 30 * 60; // 30 minutes
  console.log(
    `[1/4] createTender deadline=${deadline} (${new Date(deadline * 1000).toISOString()})`
  );
  const config = {
    description:
      "DEMO TENDER (v4 governance, fresh) - 30 minute deadline. After deadline + REVEAL_TIMELOCK (60 s) ANY non-owner wallet can call requestReveal() to demonstrate the permissionless reveal pipeline live. Production REVEAL_TIMELOCK target: 7 days; this build uses 60 s for recording window.",
    deadline: BigInt(deadline),
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
    boqReference: "BoQ-DEMO-V4-PERMISSIONLESS-FRESH",
    standardsReference:
      "Demo only - REVEAL_TIMELOCK = 60 s in this build; production target 7 days",
    completionDays: 30n,
    liquidatedDamages: 100_000_000n,
  };
  const opts1 = await txOpts(provider);
  const tx1 = await factory.createTender(config, spec, opts1);
  const rc1 = await tx1.wait();
  const ev = rc1.logs
    .map((l: any) => {
      try {
        return factory.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p: any) => p?.name === "TenderCreated");
  if (!ev) throw new Error("TenderCreated not emitted");
  const tenderId = ev.args.tenderId as bigint;
  const tenderAddr = ev.args.tenderContract as string;
  console.log(`  tenderId=${tenderId}, address=${tenderAddr}, tx=${tx1.hash}\n`);

  // ----------------------------------------------------------
  // Step 2: Karadeniz bid arm submits encrypted bid immediately
  // ----------------------------------------------------------
  console.log("[2/4] Karadeniz bid arm encrypted submitBid");
  const bidder = bidWallet("sealtender::bid-arm::karadeniz", provider);
  console.log(`  bidder=${bidder.address}`);

  // Top up if needed
  const bal = await provider.getBalance(bidder.address);
  const target = ethers.parseEther("0.020");
  if (bal < target) {
    const fundTx = await deployer.sendTransaction({
      to: bidder.address,
      value: target - bal,
      ...(await txOpts(provider)),
    });
    await fundTx.wait();
    console.log(`  funded +${ethers.formatEther(target - bal)} ETH (tx ${fundTx.hash})`);
  }

  // Deposit
  const required = (await escrow.requiredDeposit(tenderId)) as bigint;
  const escrowFromBidder = escrow.connect(bidder) as ethers.Contract;
  const existing = (await escrow.deposits(tenderId, bidder.address)) as bigint;
  if (existing < required) {
    const depTx = await escrowFromBidder.deposit(tenderId, {
      value: required,
      ...(await txOpts(provider)),
    });
    await depTx.wait();
    console.log(`  deposit ${ethers.formatEther(required)} ETH tx=${depTx.hash}`);
  }

  // Encrypted bid
  const fhe = await createInstance({ ...SepoliaConfig, network: SEPOLIA_RPC });
  const tenderAbi = [
    "function submitBid(bytes32 _encPrice, bytes _priceProof, bytes32 _encYears, bytes _yearsProof, bytes32 _encProjects, bytes _projectsProof, bytes32 _encBond, bytes _bondProof) external",
    "function evaluateBatch(uint256, uint256) external",
    "function evaluatedCount() view returns (uint256)",
    "function evaluationComplete() view returns (bool)",
    "function getConfig() view returns ((string description, uint256 deadline, uint32 weightYears, uint32 weightProjects, uint32 weightBond, uint32 minYears, uint32 minProjects, uint64 minBond, uint256 escrowAmount, uint256 maxBidders, uint256 minReputation))",
    "function state() view returns (uint8)",
  ];
  const tender = new ethers.Contract(tenderAddr, tenderAbi, bidder);
  const buf = fhe.createEncryptedInput(tenderAddr, bidder.address);
  buf.add64(1_500_000_000_000n);
  buf.add32(BigInt(12));
  buf.add32(BigInt(47));
  buf.add64(100_000_000_000n);
  const enc = await buf.encrypt();
  const handle = (i: number) => ethers.hexlify(enc.handles[i]);
  const proof = ethers.hexlify(enc.inputProof);
  const submitTx = await tender.submitBid(
    handle(0), proof,
    handle(1), proof,
    handle(2), proof,
    handle(3), proof,
    { gasLimit: 5_000_000n, ...(await txOpts(provider)) }
  );
  const submitRc = await submitTx.wait();
  console.log(
    `  submitBid tx=${submitTx.hash}, gas=${submitRc!.gasUsed}, status=${submitRc!.status === 1 ? "OK" : "FAIL"}\n`
  );

  // ----------------------------------------------------------
  // Step 3: wait for deadline + REVEAL_TIMELOCK + buffer
  // ----------------------------------------------------------
  console.log("[3/4] Wait for deadline + REVEAL_TIMELOCK (60 s) + 5 s buffer");
  const targetTs = deadline + 60 + 5;
  const block2 = await provider.getBlock("latest");
  const waitSec = Math.max(0, targetTs - block2!.timestamp);
  console.log(`  sleep ${waitSec} s (~${Math.ceil(waitSec / 60)} min)`);
  if (waitSec > 0) await sleep(waitSec * 1000);

  // ----------------------------------------------------------
  // Step 4: permissionless evaluateBatch
  // ----------------------------------------------------------
  console.log("\n[4/4] Permissionless evaluateBatch on demo tender");
  const tx4 = await (
    new ethers.Contract(tenderAddr, tenderAbi, deployer)
  ).evaluateBatch(0, 1, { gasLimit: 5_000_000n, ...(await txOpts(provider)) });
  const rc4 = await tx4.wait();
  console.log(`  evaluateBatch tx=${tx4.hash}, gas=${rc4!.gasUsed}`);
  const tenderRO = new ethers.Contract(tenderAddr, tenderAbi, provider);
  console.log(
    `  evaluationComplete=${await tenderRO.evaluationComplete()}, state=${await tenderRO.state()}`
  );

  // Persist final v4 demo state
  const populated = {
    populatedAt: new Date().toISOString(),
    factoryV4: FACTORY_V4,
    demoTenderId: Number(tenderId),
    demoTenderAddress: tenderAddr,
    deadline,
    deadlineISO: new Date(deadline * 1000).toISOString(),
    revealUnlockedAt: deadline + 60,
    revealUnlockedAtISO: new Date((deadline + 60) * 1000).toISOString(),
    note: `Demo tender ${tenderId} is post-deadline + post-REVEAL_TIMELOCK + EvaluationComplete. ANY wallet can now call EncryptedTender(${tenderAddr}).requestReveal() permissionlessly.`,
  };
  writeFileSync(
    join(__dirname, "../deployments/sepolia/v4-demo.json"),
    JSON.stringify(populated, null, 2)
  );

  console.log("\n=== Fresh demo tender ready ===");
  console.log(
    `Tender ${tenderId} @ ${tenderAddr} -- post-deadline + post-timelock + EvaluationComplete`
  );
  console.log(
    `Live demo: any non-owner wallet can call requestReveal() at ${tenderAddr}`
  );
}

main().catch((e) => {
  console.error("\n[FAIL]", e);
  process.exit(1);
});
