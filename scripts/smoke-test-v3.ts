// Smoke-test the v3 Sepolia deployment to confirm wiring is correct.
//
// What this exercises:
//   1. BidEscrow has the new state vars (TENDER_STATE_CANCELLED, tenderOf).
//   2. PriceEscalation has tenderManager set to TenderFactory.
//   3. BidderRegistry has tenderManager set to TenderFactory.
//   4. Factory's escalation/disputeManager pointers are wired.
//
// Read-only — does not send transactions, so it's safe to re-run.
import "dotenv/config";
import { ethers } from "ethers";

const SEPOLIA_RPC =
  process.env.SEPOLIA_RPC_URL || "https://sepolia.gateway.tenderly.co";

const ADDRESSES = {
  BidderRegistry: "0x2E8037626102ca3393ab9EfE7a3A254b30B236CA",
  BidEscrow: "0x76FBC67992459E972b80A88e11a5c15B0CFDBD11",
  ConfidentialUSDC: "0xCe493fFaBf3763df8057E58c22a6dC6a65806553",
  PriceEscalation: "0x1CE25ee2D44aDCa3127AD3b3B9e0B6CBd598C012",
  CollisionDetector: "0x3e8c0eDC536bce66ba8ef161eC40E7fA39d38Aee",
  TenderFactory: "0x617C5414f0b9e2a2c7850d81068FC50138b5c96f",
  DisputeManager: "0xEae392E045518CF78FF279Bf4129b9073eB3A5bb",
};

async function main() {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);

  console.log("=== SealTender v3 Sepolia smoke test ===\n");

  // BidEscrow — new state
  const escrow = new ethers.Contract(
    ADDRESSES.BidEscrow,
    [
      "function TENDER_STATE_CANCELLED() view returns (uint8)",
      "function tenderOf(uint256) view returns (address)",
      "function authorizedCallers(address) view returns (bool)",
      "function owner() view returns (address)",
    ],
    provider
  );
  const cancelledConst = await escrow.TENDER_STATE_CANCELLED();
  const factoryAuthorized = await escrow.authorizedCallers(
    ADDRESSES.TenderFactory
  );
  const escrowOwner = await escrow.owner();
  console.log("BidEscrow");
  console.log("  TENDER_STATE_CANCELLED =", cancelledConst.toString(), "(expected 5)");
  console.log("  TenderFactory authorized:", factoryAuthorized);
  console.log("  owner:", escrowOwner);
  console.log();

  // PriceEscalation — new tenderManager wiring
  const escalation = new ethers.Contract(
    ADDRESSES.PriceEscalation,
    [
      "function tenderManager() view returns (address)",
      "function owner() view returns (address)",
      "function pyth() view returns (address)",
    ],
    provider
  );
  const escalationTM = await escalation.tenderManager();
  const escalationPyth = await escalation.pyth();
  console.log("PriceEscalation");
  console.log("  tenderManager:", escalationTM);
  console.log("  expected:    ", ADDRESSES.TenderFactory);
  console.log("  match:", escalationTM.toLowerCase() === ADDRESSES.TenderFactory.toLowerCase());
  console.log("  pyth:", escalationPyth);
  console.log();

  // BidderRegistry — tenderManager
  const registry = new ethers.Contract(
    ADDRESSES.BidderRegistry,
    [
      "function tenderManager() view returns (address)",
      "function authorizedCallers(address) view returns (bool)",
    ],
    provider
  );
  const regTM = await registry.tenderManager();
  const dmAuthorizedOnRegistry = await registry.authorizedCallers(
    ADDRESSES.DisputeManager
  );
  console.log("BidderRegistry");
  console.log("  tenderManager:", regTM);
  console.log("  match:", regTM.toLowerCase() === ADDRESSES.TenderFactory.toLowerCase());
  console.log("  DisputeManager authorized:", dmAuthorizedOnRegistry);
  console.log();

  // TenderFactory — module pointers
  const factory = new ethers.Contract(
    ADDRESSES.TenderFactory,
    [
      "function registry() view returns (address)",
      "function escrow() view returns (address)",
      "function disputeManager() view returns (address)",
      "function escalation() view returns (address)",
      "function collisionDetector() view returns (address)",
      "function tenderCount() view returns (uint256)",
    ],
    provider
  );
  const facReg = await factory.registry();
  const facEsc = await factory.escrow();
  const facDM = await factory.disputeManager();
  const facEsc2 = await factory.escalation();
  const facCD = await factory.collisionDetector();
  const tenderCount = await factory.tenderCount();
  console.log("TenderFactory");
  console.log("  registry:         ", facReg, facReg.toLowerCase() === ADDRESSES.BidderRegistry.toLowerCase() ? "✓" : "✗");
  console.log("  escrow:           ", facEsc, facEsc.toLowerCase() === ADDRESSES.BidEscrow.toLowerCase() ? "✓" : "✗");
  console.log("  disputeManager:   ", facDM, facDM.toLowerCase() === ADDRESSES.DisputeManager.toLowerCase() ? "✓" : "✗");
  console.log("  escalation:       ", facEsc2, facEsc2.toLowerCase() === ADDRESSES.PriceEscalation.toLowerCase() ? "✓" : "✗");
  console.log("  collisionDetector:", facCD, facCD.toLowerCase() === ADDRESSES.CollisionDetector.toLowerCase() ? "✓" : "✗");
  console.log("  tenderCount:      ", tenderCount.toString());
  console.log();

  // DisputeManager — sanity
  const dm = new ethers.Contract(
    ADDRESSES.DisputeManager,
    [
      "function escrow() view returns (address)",
      "function registry() view returns (address)",
      "function CITIZEN_STAKE() view returns (uint256)",
      "function COMPLAINT_STAKE_BPS() view returns (uint256)",
    ],
    provider
  );
  const dmEsc = await dm.escrow();
  const dmReg = await dm.registry();
  const citizenStake = await dm.CITIZEN_STAKE();
  const stakeBps = await dm.COMPLAINT_STAKE_BPS();
  console.log("DisputeManager");
  console.log("  escrow:        ", dmEsc, dmEsc.toLowerCase() === ADDRESSES.BidEscrow.toLowerCase() ? "✓" : "✗");
  console.log("  registry:      ", dmReg, dmReg.toLowerCase() === ADDRESSES.BidderRegistry.toLowerCase() ? "✓" : "✗");
  console.log("  CITIZEN_STAKE: ", ethers.formatEther(citizenStake), "ETH");
  console.log("  STAKE_BPS:     ", stakeBps.toString(), "(", Number(stakeBps) / 100, "%)");
  console.log("\n=== smoke test complete ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
