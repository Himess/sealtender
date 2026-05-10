"use client";

// /cusdc — Bidder onboarding for the ERC-7984 confidential USDC flow.
//
// Before a bidder can deposit on a v7 tender, three steps must be in place:
//   1. They hold MockUSDC (demo only — Circle USDC in production).
//   2. They have wrapped USDC into cUSDC (their balance is encrypted).
//   3. They have authorized BidEscrow as their cUSDC operator.
//
// This page exposes those steps as a single guided UI so demo viewers see the
// ERC-7984 setup happen in real time, with MetaMask popups for each tx.
import { useState, useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseAbi } from "viem";
import {
  Coins,
  Lock,
  ShieldCheck,
  Loader2,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import {
  ADDRESSES,
  MockUSDCABI,
  ConfidentialUSDCABI,
} from "@/lib/contracts";

const usdcAbi = parseAbi(MockUSDCABI);
const cUSDCAbi = parseAbi(ConfidentialUSDCABI);

// Demo defaults — large enough to bid on every tender many times.
const FAUCET_AMOUNT = 10_000_000_000n; // 10,000 USDC (6 decimals)

export default function CUSDCPage() {
  const { address: userAddress, isConnected } = useAccount();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const { data: usdcBalanceData, refetch: refetchUSDC } = useReadContract({
    address: ADDRESSES.MockUSDC as `0x${string}`,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: Boolean(userAddress) },
  });
  const usdcBalance = (usdcBalanceData ?? 0n) as bigint;

  const { data: usdcAllowanceData, refetch: refetchAllowance } = useReadContract({
    address: ADDRESSES.MockUSDC as `0x${string}`,
    abi: usdcAbi,
    functionName: "allowance",
    args: userAddress ? [userAddress, ADDRESSES.ConfidentialUSDC as `0x${string}`] : undefined,
    query: { enabled: Boolean(userAddress) },
  });
  const usdcAllowance = (usdcAllowanceData ?? 0n) as bigint;

  const { data: isOpData, refetch: refetchOp } = useReadContract({
    address: ADDRESSES.ConfidentialUSDC as `0x${string}`,
    abi: cUSDCAbi,
    functionName: "isOperator",
    args: userAddress
      ? [userAddress, ADDRESSES.BidEscrow as `0x${string}`]
      : undefined,
    query: { enabled: Boolean(userAddress) },
  });
  const isOperator = Boolean(isOpData);

  const { writeContract, data: hash, error: writeError } = useWriteContract();
  const { isSuccess: txSuccess, isLoading: txConfirming } = useWaitForTransactionReceipt({ hash });

  const refresh = useCallback(async () => {
    await Promise.all([refetchUSDC(), refetchAllowance(), refetchOp()]);
  }, [refetchUSDC, refetchAllowance, refetchOp]);

  // Side effect: when a tx settles, refresh + clear busy state.
  if (txSuccess && busy) {
    void refresh().then(() => setBusy(null));
  }

  if (writeError && busy && !error) {
    setError((writeError as Error).message.slice(0, 200));
    setBusy(null);
  }

  function mintUSDC() {
    if (!userAddress) return;
    setError("");
    setBusy("mint");
    writeContract({
      address: ADDRESSES.MockUSDC as `0x${string}`,
      abi: usdcAbi,
      functionName: "mint",
      args: [userAddress, FAUCET_AMOUNT],
    });
  }

  function approveCUSDC() {
    setError("");
    setBusy("approve");
    writeContract({
      address: ADDRESSES.MockUSDC as `0x${string}`,
      abi: usdcAbi,
      functionName: "approve",
      args: [ADDRESSES.ConfidentialUSDC as `0x${string}`, FAUCET_AMOUNT],
    });
  }

  function wrapUSDC() {
    if (!userAddress) return;
    setError("");
    setBusy("wrap");
    writeContract({
      address: ADDRESSES.ConfidentialUSDC as `0x${string}`,
      abi: cUSDCAbi,
      functionName: "wrap",
      args: [userAddress, FAUCET_AMOUNT],
    });
  }

  function setOperator() {
    setError("");
    setBusy("operator");
    // 10-year operator authorization (effectively unbounded for the demo).
    // setOperator's `until` is uint48; pack as a Number that fits 48-bit space.
    const until = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
    writeContract({
      address: ADDRESSES.ConfidentialUSDC as `0x${string}`,
      abi: cUSDCAbi,
      functionName: "setOperator",
      args: [ADDRESSES.BidEscrow as `0x${string}`, until],
    });
  }

  // Step gating: we move through 1 → 2 → 3 → 4. Each next step unlocks when
  // the previous condition is satisfied.
  const hasUSDC = usdcBalance >= FAUCET_AMOUNT;
  const isApproved = usdcAllowance >= FAUCET_AMOUNT;
  const allReady = isOperator;

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Lock size={36} className="text-[#555555] mx-auto" />
          <p className="font-body text-[14px] text-[#666666]">
            Connect your wallet to set up cUSDC.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-[10px] font-medium border border-[#00E87B]/20 bg-[#00E87B]/10 text-[#00E87B] uppercase tracking-[1px] mb-3">
          <ShieldCheck size={11} /> ERC-7984 / Zama fhEVM
        </div>
        <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
          Set Up Confidential USDC
        </h1>
        <p className="font-body text-[14px] text-[#666666] mt-1 max-w-2xl">
          Bid bonds in SealTender v7 are denominated in cUSDC — OpenZeppelin&apos;s
          ERC-7984 wrapper around USDC. Wrapping turns each balance into a
          ciphertext that only the holder can decrypt. Complete the four steps
          below before submitting your first bid.
        </p>
      </div>

      {error && (
        <div className="bg-[#FF4444]/10 border border-[#FF4444]/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-[#FF4444] shrink-0 mt-0.5" />
          <p className="font-body text-[12px] text-[#FF4444] break-all">{error}</p>
        </div>
      )}

      {allReady && (
        <div className="bg-[#00E87B]/10 border border-[#00E87B]/30 rounded-lg p-5 flex items-start gap-3">
          <CheckCircle size={18} className="text-[#00E87B] shrink-0 mt-0.5" />
          <div>
            <p className="font-body text-[14px] text-[#00E87B] font-semibold">
              Ready to bid
            </p>
            <p className="font-body text-[12px] text-[#888888] mt-1">
              cUSDC balance funded · BidEscrow operator authorized. Head to any
              open tender and submit an encrypted bid.
            </p>
          </div>
        </div>
      )}

      {/* Step 1: mint USDC */}
      <StepCard
        n={1}
        label="Mint demo USDC"
        desc={`Mint ${(Number(FAUCET_AMOUNT) / 1e6).toLocaleString()} demo USDC. In production this would come from Circle's USDC faucet.`}
        done={hasUSDC}
        busy={busy === "mint" && txConfirming}
        onClick={mintUSDC}
        cta="Mint"
        status={`Balance: ${(Number(usdcBalance) / 1e6).toLocaleString()} USDC`}
      />

      {/* Step 2: approve cUSDC to pull USDC */}
      <StepCard
        n={2}
        label="Approve cUSDC wrapper"
        desc="ERC-20 approve so the cUSDC contract can pull your USDC during wrap."
        done={isApproved}
        busy={busy === "approve" && txConfirming}
        onClick={approveCUSDC}
        cta="Approve"
        status={`Allowance: ${(Number(usdcAllowance) / 1e6).toLocaleString()} USDC`}
        disabled={!hasUSDC}
      />

      {/* Step 3: wrap USDC → cUSDC */}
      <StepCard
        n={3}
        label="Wrap USDC → cUSDC"
        desc="Mints an encrypted ERC-7984 balance held in your wallet. Only you can decrypt it via the Zama relayer."
        done={false /* wrapped amount is encrypted; we can't read it on-chain */}
        busy={busy === "wrap" && txConfirming}
        onClick={wrapUSDC}
        cta="Wrap"
        status="(After wrap, balance moves to encrypted cUSDC handle)"
        disabled={!isApproved}
      />

      {/* Step 4: setOperator(BidEscrow) */}
      <StepCard
        n={4}
        label="Authorize BidEscrow as cUSDC operator"
        desc="Allows BidEscrow.deposit() to pull encrypted cUSDC from your wallet on submitBid. Without this, deposit reverts inside confidentialTransferFrom."
        done={isOperator}
        busy={busy === "operator" && txConfirming}
        onClick={setOperator}
        cta="Approve operator"
        status={isOperator ? "BidEscrow is authorized" : "Not authorized"}
      />

      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-5 space-y-2">
        <div className="flex items-center gap-2 font-body text-[14px] text-[#F0F0F0] font-medium">
          <Coins size={14} className="text-[#A855F7]" />
          Why ERC-7984?
        </div>
        <p className="font-body text-[13px] text-[#888888] leading-relaxed">
          Procurement bond amounts are commercially sensitive. ERC-20 leaks them
          via Transfer events. ERC-7984 (Zama&apos;s confidential token standard,
          shipped by OpenZeppelin in Confidential Contracts v0.4) keeps balance
          + transfer amounts as FHE-encrypted euint64 ciphertexts. The contract
          can run logic on them (FHE.ge, FHE.select) without ever seeing
          plaintext, and only the holder + a 9-of-13 KMS quorum can decrypt.
        </p>
      </div>
    </div>
  );
}

function StepCard({
  n,
  label,
  desc,
  done,
  busy,
  disabled,
  onClick,
  cta,
  status,
}: {
  n: number;
  label: string;
  desc: string;
  done: boolean;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  cta: string;
  status?: string;
}) {
  return (
    <div
      className={`bg-[#0D0F14] border rounded-lg p-5 ${
        done ? "border-[#00E87B]/30" : "border-[#1E2230]"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-heading font-bold text-[14px] ${
            done
              ? "bg-[#00E87B]/10 border border-[#00E87B]/30 text-[#00E87B]"
              : "bg-[#151820] border border-[#1E2230] text-[#888888]"
          }`}
        >
          {done ? <CheckCircle size={16} /> : n}
        </div>
        <div className="flex-1">
          <p className="font-body text-[14px] text-[#F0F0F0] font-medium">{label}</p>
          <p className="font-body text-[12px] text-[#888888] mt-1 leading-relaxed">{desc}</p>
          {status && (
            <p className="font-body text-[11px] text-[#666666] mt-2 font-mono">{status}</p>
          )}
        </div>
        <div>
          <button
            onClick={onClick}
            disabled={done || busy || disabled}
            className={`px-4 py-2 rounded-lg font-body text-[13px] font-medium transition-colors flex items-center gap-2 ${
              done
                ? "bg-[#0C0D14] border border-[#00E87B]/20 text-[#00E87B] cursor-default"
                : "bg-[#00E87B] text-[#08090E] hover:bg-[#00E87B]/90 disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Confirming...
              </>
            ) : done ? (
              "Done"
            ) : (
              cta
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
