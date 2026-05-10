// Resume demo tender flow after the long-deadline createTender already
// landed (tender id 4 @ 0xb01B54EDa8e0dA203154656852492B9BA6B1d5AA).
// What's left: bid + sleep until deadline+timelock + evaluateBatch.
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
const DEMO_TENDER_ID = 4n;
const DEMO_TENDER_ADDR = "0xb01B54EDa8e0dA203154656852492B9BA6B1d5AA";

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

  const tenderAbi = [
    "function submitBid(bytes32, bytes, bytes32, bytes, bytes32, bytes, bytes32, bytes) external",
    "function evaluateBatch(uint256, uint256) external",
    "function evaluatedCount() view returns (uint256)",
    "function evaluationComplete() view returns (bool)",
    "function hasBid(address) view returns (bool)",
    "function getConfig() view returns ((string description, uint256 deadline, uint32 weightYears, uint32 weightProjects, uint32 weightBond, uint32 minYears, uint32 minProjects, uint64 minBond, uint256 escrowAmount, uint256 maxBidders, uint256 minReputation))",
    "function state() view returns (uint8)",
  ];

  const escrow = new ethers.Contract(ESCROW, loadAbi("BidEscrow"), deployer);

  // ----------------------------------------------------------
  // Step 1: bid (idempotent)
  // ----------------------------------------------------------
  const bidder = bidWallet("sealtender::bid-arm::karadeniz", provider);
  console.log("\n[1/3] Karadeniz bid arm (", bidder.address, ") submitBid on tender", DEMO_TENDER_ID.toString());
  const tender = new ethers.Contract(DEMO_TENDER_ADDR, tenderAbi, bidder);
  if (await tender.hasBid(bidder.address)) {
    console.log("  already bid -- skipping");
  } else {
    // Top up
    const bal = await provider.getBalance(bidder.address);
    const target = ethers.parseEther("0.020");
    if (bal < target) {
      const t = await deployer.sendTransaction({
        to: bidder.address,
        value: target - bal,
        ...(await txOpts(provider)),
      });
      await t.wait();
      console.log("  funded +", ethers.formatEther(target - bal), "ETH (tx", t.hash, ")");
    }
    // Deposit
    const required = (await escrow.requiredDeposit(DEMO_TENDER_ID)) as bigint;
    const existing = (await escrow.deposits(DEMO_TENDER_ID, bidder.address)) as bigint;
    if (existing < required) {
      const escrowFromBidder = escrow.connect(bidder) as ethers.Contract;
      const dt = await escrowFromBidder.deposit(DEMO_TENDER_ID, {
        value: required,
        ...(await txOpts(provider)),
      });
      await dt.wait();
      console.log("  deposit", ethers.formatEther(required), "ETH tx=", dt.hash);
    }
    // Encrypt + submit
    const fhe = await createInstance({ ...SepoliaConfig, network: SEPOLIA_RPC });
    const buf = fhe.createEncryptedInput(DEMO_TENDER_ADDR, bidder.address);
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
    console.log("  submitBid tx=", submitTx.hash, ", gas=", submitRc!.gasUsed, ", status=", submitRc!.status);
  }

  // ----------------------------------------------------------
  // Step 2: sleep until deadline + REVEAL_TIMELOCK + 5 s
  // ----------------------------------------------------------
  const cfg = await new ethers.Contract(DEMO_TENDER_ADDR, tenderAbi, provider).getConfig();
  const deadline = Number(cfg.deadline);
  const block = await provider.getBlock("latest");
  const targetTs = deadline + 60 + 5;
  const waitSec = Math.max(0, targetTs - block!.timestamp);
  console.log(
    `\n[2/3] Sleep ${waitSec} s (~${Math.ceil(waitSec / 60)} min) for deadline+REVEAL_TIMELOCK`
  );
  if (waitSec > 0) await sleep(waitSec * 1000);

  // ----------------------------------------------------------
  // Step 3: permissionless evaluateBatch
  // ----------------------------------------------------------
  console.log("\n[3/3] Permissionless evaluateBatch");
  const tenderRW = new ethers.Contract(DEMO_TENDER_ADDR, tenderAbi, deployer);
  if (await tenderRW.evaluationComplete()) {
    console.log("  already complete");
  } else {
    const t = await tenderRW.evaluateBatch(0, 1, {
      gasLimit: 5_000_000n,
      ...(await txOpts(provider)),
    });
    const rc = await t.wait();
    console.log("  evaluateBatch tx=", t.hash, ", gas=", rc!.gasUsed);
  }
  console.log(
    `  evaluationComplete=${await tenderRW.evaluationComplete()}, state=${await tenderRW.state()}`
  );

  writeFileSync(
    join(__dirname, "../deployments/sepolia/v4-demo.json"),
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        factoryV4: FACTORY_V4,
        demoTenderId: 4,
        demoTenderAddress: DEMO_TENDER_ADDR,
        deadline,
        deadlineISO: new Date(deadline * 1000).toISOString(),
        revealUnlockedAtISO: new Date((deadline + 60) * 1000).toISOString(),
        note: `Demo tender 4 is post-deadline + post-REVEAL_TIMELOCK + EvaluationComplete. ANY non-owner wallet can call requestReveal() at ${DEMO_TENDER_ADDR}.`,
      },
      null,
      2
    )
  );

  console.log("\n=== Demo tender 4 ready for live recording ===");
}

main().catch((e) => {
  console.error("\n[FAIL]", e);
  process.exit(1);
});
