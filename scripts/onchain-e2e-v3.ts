// End-to-end on-chain test against the v3 Sepolia deployment.
//
// Exercises B-L6 (permissionless claimRefund) and B-M5 (factory auto-authorizes
// new tenders on PriceEscalation) in a single tx-sending flow. Idempotent on
// repeated runs by always creating a fresh tender (factory just appends).
//
// Flow:
//   1. createTender(escrowAmount = 0.001 ETH) via TenderFactory
//   2. assert BidEscrow.tenderOf(id) == new tender address     (B-L6 wiring)
//   3. assert PriceEscalation.authorizedTenders(tender) == true (B-M5 wiring)
//   4. registerBidder(deployer)                                 (registry path)
//   5. BidEscrow.deposit{value:0.001 ETH}(id)                   (escrow path)
//   6. EncryptedTender.cancelTender()                           (state -> Cancelled)
//   7. BidEscrow.claimRefund(id)                                (B-L6 happy path)
//   8. assert deposit cleared, deposit status == Refunded(4)
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { ethers } from "ethers";

const SEPOLIA_RPC =
  process.env.SEPOLIA_RPC_URL || "https://sepolia.gateway.tenderly.co";
const KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!KEY) throw new Error("DEPLOYER_PRIVATE_KEY missing in .env");

const ADDRESSES = {
  BidderRegistry: "0x2E8037626102ca3393ab9EfE7a3A254b30B236CA",
  BidEscrow: "0x76FBC67992459E972b80A88e11a5c15B0CFDBD11",
  PriceEscalation: "0x1CE25ee2D44aDCa3127AD3b3B9e0B6CBd598C012",
  TenderFactory: "0x617C5414f0b9e2a2c7850d81068FC50138b5c96f",
};

function loadAbi(name: string): any[] {
  const path = join(
    __dirname,
    `../deployments/sepolia/${name}.json`
  );
  return JSON.parse(readFileSync(path, "utf-8")).abi;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const signer = new ethers.Wallet(KEY!, provider);
  console.log("Signer:", signer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await provider.getBalance(signer.address)),
    "ETH\n"
  );

  const factory = new ethers.Contract(
    ADDRESSES.TenderFactory,
    loadAbi("TenderFactory"),
    signer
  );
  const escrow = new ethers.Contract(
    ADDRESSES.BidEscrow,
    loadAbi("BidEscrow"),
    signer
  );
  const escalation = new ethers.Contract(
    ADDRESSES.PriceEscalation,
    loadAbi("PriceEscalation"),
    signer
  );
  const registry = new ethers.Contract(
    ADDRESSES.BidderRegistry,
    loadAbi("BidderRegistry"),
    signer
  );

  const ESCROW_AMOUNT = ethers.parseEther("0.001");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3 * 24 * 3600);

  // 1. createTender ---------------------------------------------------------
  console.log("[1/8] createTender(escrow=0.001 ETH)...");
  const config = {
    description: "v3 e2e smoke",
    deadline,
    weightYears: 30,
    weightProjects: 30,
    weightBond: 40,
    minYears: 0,
    minProjects: 0,
    minBond: 0n,
    escrowAmount: ESCROW_AMOUNT,
    maxBidders: 1n,
    minReputation: 0n,
  };
  const spec = {
    category: "test",
    totalAreaM2: 0n,
    estimatedValueMin: 0n,
    estimatedValueMax: 0n,
    boqReference: "",
    standardsReference: "",
    completionDays: 0n,
    liquidatedDamages: 0n,
  };
  const tx1 = await factory.createTender(config, spec);
  const rc1 = await tx1.wait();
  // Pull tenderId/address from the TenderCreated event
  const ev = rc1.logs
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
  console.log(`  tenderId=${tenderId}, address=${tenderAddr}, gas=${rc1.gasUsed}`);
  console.log(`  tx=${tx1.hash}\n`);

  // 2. B-L6 wiring check ---------------------------------------------------
  console.log("[2/8] BidEscrow.tenderOf wiring (B-L6)...");
  const onChainTenderOf = await escrow.tenderOf(tenderId);
  const tenderOfMatches =
    onChainTenderOf.toLowerCase() === tenderAddr.toLowerCase();
  console.log(`  tenderOf(${tenderId}) = ${onChainTenderOf}`);
  console.log(`  match: ${tenderOfMatches ? "✓" : "✗"}`);
  if (!tenderOfMatches) throw new Error("B-L6 tenderOf wiring broken");
  console.log();

  // 3. B-M5 wiring check ---------------------------------------------------
  console.log("[3/8] PriceEscalation.authorizedTenders wiring (B-M5)...");
  const isTenderAuthorized = await escalation.authorizedTenders(tenderAddr);
  console.log(`  authorizedTenders(${tenderAddr}) = ${isTenderAuthorized}`);
  console.log(`  match: ${isTenderAuthorized ? "✓" : "✗"}`);
  if (!isTenderAuthorized) throw new Error("B-M5 authorizeTender wiring broken");
  console.log();

  // 4. registerBidder ------------------------------------------------------
  console.log("[4/8] registerBidder(deployer)...");
  const alreadyVerified = await registry.isVerified(signer.address);
  if (!alreadyVerified) {
    const tx4 = await registry.registerBidder(signer.address);
    await tx4.wait();
    console.log(`  registered, tx=${tx4.hash}`);
  } else {
    console.log("  already registered, skipping");
  }
  console.log();

  // 5. deposit -------------------------------------------------------------
  console.log("[5/8] BidEscrow.deposit(tenderId, value=0.001 ETH)...");
  const tx5 = await escrow.deposit(tenderId, { value: ESCROW_AMOUNT });
  const rc5 = await tx5.wait();
  console.log(`  deposited, gas=${rc5.gasUsed}, tx=${tx5.hash}`);
  const deposit = await escrow.deposits(tenderId, signer.address);
  const status = await escrow.depositStatus(tenderId, signer.address);
  console.log(`  deposit=${ethers.formatEther(deposit)} ETH, status=${status} (1=Active)`);
  console.log();

  // 6. cancelTender --------------------------------------------------------
  console.log("[6/8] EncryptedTender.cancelTender()...");
  const tender = new ethers.Contract(
    tenderAddr,
    [
      "function cancelTender() external",
      "function state() external view returns (uint8)",
    ],
    signer
  );
  const tx6 = await tender.cancelTender();
  await tx6.wait();
  const stateAfter = await tender.state();
  console.log(`  cancelled, state=${stateAfter} (5=Cancelled), tx=${tx6.hash}\n`);

  // 7. claimRefund (B-L6 happy path) ---------------------------------------
  console.log("[7/8] BidEscrow.claimRefund(tenderId)...");
  const balBefore = await provider.getBalance(signer.address);
  const tx7 = await escrow.claimRefund(tenderId);
  const rc7 = await tx7.wait();
  const balAfter = await provider.getBalance(signer.address);
  const gasCost = rc7.gasUsed * rc7.gasPrice;
  const recovered = balAfter - balBefore + gasCost;
  console.log(`  refunded, gas=${rc7.gasUsed}, tx=${tx7.hash}`);
  console.log(
    `  net recovered (delta + gas): ${ethers.formatEther(recovered)} ETH (expected 0.001)`
  );
  if (recovered !== ESCROW_AMOUNT) {
    throw new Error(
      `claimRefund value mismatch: got ${recovered}, expected ${ESCROW_AMOUNT}`
    );
  }
  console.log();

  // 8. final state ---------------------------------------------------------
  console.log("[8/8] Post-refund state...");
  const depositAfter = await escrow.deposits(tenderId, signer.address);
  const statusAfter = await escrow.depositStatus(tenderId, signer.address);
  const totalAfter = await escrow.totalEscrow(tenderId);
  console.log(
    `  deposit=${ethers.formatEther(depositAfter)} (expected 0)` +
      `, status=${statusAfter} (expected 4=Refunded), totalEscrow=${ethers.formatEther(totalAfter)}`
  );
  if (depositAfter !== 0n || statusAfter !== 4n || totalAfter !== 0n) {
    throw new Error("post-refund state incorrect");
  }

  console.log("\n=== v3 on-chain e2e PASSED ===");
}

main().catch((e) => {
  console.error("\n[FAIL]", e);
  process.exit(1);
});
