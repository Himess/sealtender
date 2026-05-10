// Top up the v7 bid-arm wallets with enough ETH for FHE-heavy txs.
import "dotenv/config";
import { ethers } from "ethers";

const SEPOLIA_RPC =
  process.env.POPULATE_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const KEY = process.env.DEPLOYER_PRIVATE_KEY!;

const SEEDS = [
  "sealtender::v7::karadeniz",
  "sealtender::v7::anatolia",
  "sealtender::v7::otosan",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const deployer = new ethers.Wallet(KEY, provider);
  const TARGET = ethers.parseEther("0.05"); // enough for ~5 FHE-heavy txs

  for (const seed of SEEDS) {
    const k = ethers.keccak256(ethers.toUtf8Bytes(seed));
    const w = new ethers.Wallet(k, provider);
    const cur = await provider.getBalance(w.address);
    if (cur >= TARGET) {
      console.log(`${w.address}: has ${ethers.formatEther(cur)} ETH — skip`);
      continue;
    }
    const top = TARGET - cur;
    const tx = await deployer.sendTransaction({ to: w.address, value: top });
    await tx.wait();
    console.log(`${w.address}: +${ethers.formatEther(top)} ETH → ${ethers.formatEther(await provider.getBalance(w.address))}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
