// Test helper for the v7 cUSDC-native BidEscrow.
//
// Each test that needs a BidEscrow now also needs a ConfidentialUSDC token and
// an underlying MockUSDC. This helper deploys the trio in a single call and
// returns typed handles ready to use in tests.
//
// Use:
//   const { escrow, cUSDC, usdc } = await deployEscrowStack(owner);
//
// To put cUSDC on a bidder so they can `deposit()` later:
//   await fundCUSDC(usdc, cUSDC, bidder, ethers.parseUnits("100", 6));
import { ethers, fhevm } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  BidEscrow,
  ConfidentialUSDC,
  MockUSDC,
} from "../../typechain-types";

export interface EscrowStack {
  escrow: BidEscrow;
  cUSDC: ConfidentialUSDC;
  usdc: MockUSDC;
}

export async function deployEscrowStack(
  owner: HardhatEthersSigner
): Promise<EscrowStack> {
  // MockUSDC -- 6-decimal ERC20, freely mintable for tests.
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();

  // ConfidentialUSDC -- ERC-7984 wrapper over the MockUSDC underlying.
  const ConfidentialUSDC = await ethers.getContractFactory("ConfidentialUSDC");
  const cUSDC = await ConfidentialUSDC.deploy(
    owner.address,
    await usdc.getAddress()
  );
  await cUSDC.waitForDeployment();

  // BidEscrow -- accepts cUSDC via confidentialTransferFrom.
  const BidEscrow = await ethers.getContractFactory("BidEscrow");
  const escrow = await BidEscrow.deploy(owner.address, await cUSDC.getAddress());
  await escrow.waitForDeployment();

  return { escrow, cUSDC, usdc };
}

/// Mints USDC to `bidder`, wraps it into cUSDC, and authorizes `escrow` as
/// the bidder's operator on cUSDC. After this, `bidder` can call
/// `escrow.deposit(tenderId, encAmount, proof)` end-to-end.
export async function fundCUSDC(
  usdc: MockUSDC,
  cUSDC: ConfidentialUSDC,
  bidder: HardhatEthersSigner,
  amount: bigint,
  escrow?: BidEscrow
): Promise<void> {
  // Mint plain USDC.
  await (await usdc.mint(bidder.address, amount)).wait();

  // Approve the cUSDC wrapper to pull the underlying USDC.
  await (await usdc.connect(bidder).approve(await cUSDC.getAddress(), amount)).wait();

  // Wrap into encrypted cUSDC.
  await (await cUSDC.connect(bidder).wrap(bidder.address, amount)).wait();

  // If an escrow is provided, also approve it as operator so confidentialTransferFrom
  // can pull cUSDC from the bidder when deposit() is called.
  if (escrow) {
    // operator approval is unbounded for tests: until = far future
    const farFuture = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600; // ~10y
    await (
      await cUSDC.connect(bidder).setOperator(
        await escrow.getAddress(),
        farFuture
      )
    ).wait();
  }
}

/// Helper to build an encrypted euint64 input for `deposit()`. Returns the
/// (handle, inputProof) tuple the escrow expects.
///
/// Important: the proof must be bound to `(cToken.address, escrow.address)`
/// because that's where `FHE.fromExternal` ultimately runs — inside the
/// confidential token's `confidentialTransferFrom`, with `msg.sender = escrow`.
/// Creating the proof under the bidder's address (the naïve thing to do)
/// raises `InvalidSigner()` at verification time.
export async function buildEncryptedDeposit(
  amount: bigint,
  bidder: HardhatEthersSigner,
  escrow: BidEscrow,
  cUSDC: ConfidentialUSDC
): Promise<{ handle: string; proof: string }> {
  const input = fhevm.createEncryptedInput(
    await cUSDC.getAddress(),
    await escrow.getAddress()
  );
  input.add64(amount);
  const enc = await input.encrypt();
  return {
    handle: enc.handles[0] as unknown as string,
    proof: enc.inputProof as unknown as string,
  };
}

/// One-shot helper: takes a bidder with cUSDC + operator approval already in
/// place (via `fundCUSDC(usdc, cUSDC, bidder, amount, escrow)`) and deposits
/// `amount` into `escrow` for `tenderId`. Returns the tx receipt.
export async function depositCUSDC(
  escrow: BidEscrow,
  cUSDC: ConfidentialUSDC,
  bidder: HardhatEthersSigner,
  tenderId: number | bigint,
  amount: bigint
) {
  const { handle, proof } = await buildEncryptedDeposit(amount, bidder, escrow, cUSDC);
  const tx = await escrow.connect(bidder).deposit(tenderId, handle as any, proof as any);
  return tx.wait();
}

/// All-in-one bidder bootstrap: mint USDC → wrap → approve operator → deposit.
/// Use this in tests that just need a bidder with an active escrow deposit and
/// don't care about the intermediate steps.
export async function fundAndDeposit(
  stack: EscrowStack,
  bidder: HardhatEthersSigner,
  tenderId: number | bigint,
  amount: bigint
) {
  await fundCUSDC(stack.usdc, stack.cUSDC, bidder, amount, stack.escrow);
  return depositCUSDC(stack.escrow, stack.cUSDC, bidder, tenderId, amount);
}
