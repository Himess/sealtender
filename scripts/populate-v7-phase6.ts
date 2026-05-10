// Phase 6 only: encrypted deposit + submitBid for the v7 demo.
// Run after populate-v7.ts has done phases 1-5.
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { ethers } from "ethers";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";

const SEPOLIA_RPC =
  process.env.POPULATE_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!KEY) throw new Error("DEPLOYER_PRIVATE_KEY missing in .env");

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
  ];
  for (const rel of candidates) {
    try {
      return JSON.parse(readFileSync(join(__dirname, rel), "utf-8"));
    } catch {}
  }
  throw new Error(`ABI ${name} not found`);
}

let CACHED: any = null;
async function initOpts(provider: ethers.JsonRpcProvider) {
  const fee = await provider.getFeeData();
  CACHED = {
    maxPriorityFeePerGas:
      (fee.maxPriorityFeePerGas ?? ethers.parseUnits("1.5", "gwei")) + PRIORITY_FEE_BUMP,
    maxFeePerGas: (fee.maxFeePerGas ?? ethers.parseUnits("30", "gwei")) + PRIORITY_FEE_BUMP,
  };
}
function txOpts() {
  return CACHED;
}

interface BidPlan {
  label: string;
  walletSeed: string;
  tenderIdx: number;
  escrowDeposit: bigint;
  price: bigint;
  years: number;
  projects: number;
  bond: bigint;
}

const PLANS: BidPlan[] = [
  {
    label: "Karadeniz Insaat",
    walletSeed: "sealtender::v7::karadeniz",
    tenderIdx: 0,
    escrowDeposit: 2_000_000n,
    price: 27_500_000_000_000n,
    years: 12,
    projects: 47,
    bond: 250_000_000_000n,
  },
  {
    label: "Anatolia Tech",
    walletSeed: "sealtender::v7::anatolia",
    tenderIdx: 1,
    escrowDeposit: 1_000_000n,
    price: 2_100_000_000_000n,
    years: 8,
    projects: 23,
    bond: 80_000_000_000n,
  },
  {
    label: "Otosan Logistics",
    walletSeed: "sealtender::v7::otosan",
    tenderIdx: 2,
    escrowDeposit: 1_500_000n,
    price: 3_200_000_000_000n,
    years: 9,
    projects: 31,
    bond: 55_000_000_000n,
  },
];

function bidWallet(seed: string, provider: ethers.JsonRpcProvider): ethers.Wallet {
  const k = ethers.keccak256(ethers.toUtf8Bytes(seed));
  return new ethers.Wallet(k, provider);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const deployer = new ethers.Wallet(KEY!, provider);
  console.log("Deployer:", deployer.address);
  await initOpts(provider);

  const factory = new ethers.Contract(ADDRESSES.TenderFactory, artifact("TenderFactory").abi, deployer);
  const escrow = new ethers.Contract(ADDRESSES.BidEscrow, artifact("BidEscrow").abi, deployer);

  // Resolve tender addresses by id
  const tenderAddrs: string[] = [];
  for (let i = 0; i < 3; i++) {
    tenderAddrs.push(await factory.getTender(i));
  }
  console.log("Tenders:", tenderAddrs);

  // Initialize Zama relayer SDK with network URL
  const fhevm = await createInstance({ ...SepoliaConfig, network: SEPOLIA_RPC });
  console.log("Zama Relayer SDK initialized");

  for (const plan of PLANS) {
    const bw = bidWallet(plan.walletSeed, provider);
    const bidder = bw.connect(provider);
    const tenderAddr = tenderAddrs[plan.tenderIdx];
    console.log(`\n${plan.label} (${bw.address.slice(0, 10)}...) → tender ${plan.tenderIdx}`);

    // 6a. Encrypted deposit (proof bound to cUSDC + escrow)
    console.log(`  building deposit input...`);
    const depInput = fhevm.createEncryptedInput(ADDRESSES.ConfidentialUSDC, ADDRESSES.BidEscrow);
    depInput.add64(plan.escrowDeposit);
    const depEnc = await depInput.encrypt();
    console.log(`  deposit cUSDC (handle=${depEnc.handles[0].slice(0, 20)}...)`);
    let tx = await escrow.connect(bidder).deposit(
      plan.tenderIdx,
      depEnc.handles[0],
      depEnc.inputProof,
      { ...txOpts(), gasLimit: FHE_TX_GAS_LIMIT }
    );
    await tx.wait();
    console.log(`  ✓ deposit confirmed: ${tx.hash}`);
    await sleep(FHE_PACE_MS);

    // 6b. Encrypted bid (proof bound to tender + bidder)
    console.log(`  building bid input...`);
    const bidInput = fhevm.createEncryptedInput(tenderAddr, bw.address);
    bidInput.add64(plan.price);
    bidInput.add32(plan.years);
    bidInput.add32(plan.projects);
    bidInput.add64(plan.bond);
    const bidEnc = await bidInput.encrypt();
    console.log(`  submitBid (4 handles)`);
    const tender = new ethers.Contract(tenderAddr, artifact("EncryptedTender").abi, bidder);
    tx = await tender.submitBid(
      bidEnc.handles[0],
      bidEnc.inputProof,
      bidEnc.handles[1],
      bidEnc.inputProof,
      bidEnc.handles[2],
      bidEnc.inputProof,
      bidEnc.handles[3],
      bidEnc.inputProof,
      { ...txOpts(), gasLimit: FHE_TX_GAS_LIMIT }
    );
    await tx.wait();
    console.log(`  ✓ bid submitted: ${tx.hash}`);
    await sleep(FHE_PACE_MS);
  }

  console.log("\n✓ Phase 6 complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
