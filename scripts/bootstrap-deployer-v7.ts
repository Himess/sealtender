// Prepare the deployer wallet for live bidding from the frontend.
//   1. registerBidder(deployer) on the v7 registry
//   2. mint 100,000 cUSDC worth of MockUSDC to deployer
//   3. approve cUSDC wrapper to pull USDC
//   4. wrap → encrypted cUSDC balance
//   5. setOperator(BidEscrow) on cUSDC
//
// After this, the deployer wallet can connect to the frontend and bid on
// any v7 tender in two clicks (deposit + submitBid) — no /cusdc onboarding
// needed.
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { ethers } from "ethers";

const SEPOLIA_RPC =
  process.env.POPULATE_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const KEY = process.env.DEPLOYER_PRIVATE_KEY!;
const DEPLOY = JSON.parse(
  readFileSync(join(__dirname, "../deployments/sepolia/v7-cusdc.json"), "utf-8")
);
const ADDR = DEPLOY.contracts;

function artifact(name: string): { abi: any[] } {
  const candidates = [
    `../artifacts/contracts/core/${name}.sol/${name}.json`,
    `../artifacts/contracts/identity/${name}.sol/${name}.json`,
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

async function main() {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const deployer = new ethers.Wallet(KEY, provider);
  console.log("Deployer:", deployer.address);

  const registry = new ethers.Contract(ADDR.BidderRegistry, artifact("BidderRegistry").abi, deployer);
  const usdc = new ethers.Contract(ADDR.MockUSDC, artifact("MockUSDC").abi, deployer);
  const cUSDC = new ethers.Contract(ADDR.ConfidentialUSDC, artifact("ConfidentialUSDC").abi, deployer);

  const MINT = 100_000_000_000n; // 100,000 USDC (6 decimals)
  const FAR_FUTURE = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;

  // 1. register as bidder
  const profile: any = await registry.getProfile(deployer.address);
  if (!profile.verified) {
    console.log("  registerBidder(deployer)");
    await (await registry.registerBidder(deployer.address)).wait();
  } else {
    console.log("  registerBidder: already verified — skipping");
  }

  // drip a small reputation so deployer clears the construction tender (>=70)
  const score = Number(await registry.getReputationScore(deployer.address));
  if (score < 70) {
    console.log(`  drip reputation (current=${score})`);
    for (let i = 0; i < 4; i++) {
      await (await registry.recordBid(deployer.address)).wait();
    }
    for (let i = 0; i < 3; i++) {
      await (await registry.recordWin(deployer.address)).wait();
    }
    for (let i = 0; i < 2; i++) {
      await (await registry.recordCompletion(deployer.address)).wait();
    }
    console.log(`  rep -> ${await registry.getReputationScore(deployer.address)}`);
  } else {
    console.log(`  reputation ok (${score})`);
  }

  // 2. mint USDC
  const usdcBal: bigint = await usdc.balanceOf(deployer.address);
  if (usdcBal < MINT) {
    console.log("  mint USDC");
    await (await usdc.mint(deployer.address, MINT)).wait();
  } else {
    console.log("  USDC already minted");
  }

  // 3. approve cUSDC to pull USDC
  const allowance: bigint = await usdc.allowance(deployer.address, ADDR.ConfidentialUSDC);
  if (allowance < MINT) {
    console.log("  approve cUSDC wrapper");
    await (await usdc.approve(ADDR.ConfidentialUSDC, MINT)).wait();
  } else {
    console.log("  USDC allowance already set");
  }

  // 4. wrap
  console.log("  wrap USDC -> cUSDC");
  await (await cUSDC.wrap(deployer.address, MINT)).wait();

  // 5. setOperator
  const isOp: boolean = await cUSDC.isOperator(deployer.address, ADDR.BidEscrow);
  if (!isOp) {
    console.log("  setOperator(BidEscrow)");
    await (await cUSDC.setOperator(ADDR.BidEscrow, FAR_FUTURE)).wait();
  } else {
    console.log("  BidEscrow operator already authorized");
  }

  console.log("\n✓ Deployer wallet ready to bid live.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
