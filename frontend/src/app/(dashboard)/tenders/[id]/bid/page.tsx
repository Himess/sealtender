"use client";

import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseAbi, parseEther } from "viem";
import {
  ArrowLeft,
  Lock,
  Shield,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Eye,
} from "lucide-react";
import {
  useTenderAddress,
  useTenderConfig,
  useTenderState,
  formatDeadlineFull,
  stateLabel,
  parseConfig,
} from "@/hooks/useContractData";
import { EncryptedTenderABI, TenderState } from "@/lib/contracts";
import { encryptBidData } from "@/lib/fhevm";
import { Toast } from "@/components/Toast";

const tenderAbi = parseAbi(EncryptedTenderABI);

type BidStatus = "idle" | "encrypting" | "submitting" | "confirming" | "success" | "error";

export default function BidPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const tenderId = BigInt(id);
  const { address: userAddress } = useAccount();

  const { data: tenderAddress } = useTenderAddress(tenderId);
  const addr = tenderAddress as `0x${string}` | undefined;
  const { data: configData } = useTenderConfig(addr);
  const { data: state } = useTenderState(addr);

  const [price, setPrice] = useState("");
  const [deliveryYears, setDeliveryYears] = useState("");
  const [pastProjects, setPastProjects] = useState("");
  const [bondAmount, setBondAmount] = useState("");
  const [bidStatus, setBidStatus] = useState<BidStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [encryptedPreview, setEncryptedPreview] = useState<string>("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const {
    writeContract,
    data: hash,
    error: writeError,
  } = useWriteContract();

  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      setToast({ message: "Bid submitted successfully!", type: "success" });
    }
  }, [isSuccess]);

  useEffect(() => {
    if (writeError) {
      setToast({ message: writeError.message.slice(0, 100), type: "error" });
    }
  }, [writeError]);

  const config = configData ? parseConfig(configData) : null;

  const currentState = state !== undefined ? Number(state) : undefined;

  function validate(): boolean {
    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      setErrorMsg("Valid price is required");
      return false;
    }
    if (
      !deliveryYears ||
      isNaN(Number(deliveryYears)) ||
      Number(deliveryYears) <= 0
    ) {
      setErrorMsg("Valid delivery timeline is required");
      return false;
    }
    if (
      !pastProjects ||
      isNaN(Number(pastProjects)) ||
      Number(pastProjects) < 0
    ) {
      setErrorMsg("Valid past projects count is required");
      return false;
    }
    if (!bondAmount || isNaN(Number(bondAmount)) || Number(bondAmount) <= 0) {
      setErrorMsg("Valid bond amount is required");
      return false;
    }
    if (!userAddress) {
      setErrorMsg("Please connect your wallet");
      return false;
    }
    if (!addr) {
      setErrorMsg("Tender address not found");
      return false;
    }
    setErrorMsg("");
    return true;
  }

  async function handleSubmit() {
    if (!validate()) return;
    if (!addr || !userAddress) return;

    try {
      setBidStatus("encrypting");

      const encrypted = await encryptBidData(
        {
          price: BigInt(Math.floor(Number(price) * 1e6)),
          deliveryYears: Number(deliveryYears),
          pastProjects: Number(pastProjects),
          bondAmount: BigInt(Math.floor(Number(bondAmount) * 1e6)),
        },
        addr,
        userAddress
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const enc = encrypted as any;

      const handleStrs = Array.isArray(enc.handles)
        ? enc.handles.map((h: string | Uint8Array) =>
            typeof h === "string" ? h.slice(0, 18) + "..." : String(h).slice(0, 18) + "..."
          )
        : [];

      const proofStr = typeof enc.inputProof === "string"
        ? (enc.inputProof as string).slice(0, 24) + "..."
        : "0x...";

      setEncryptedPreview(
        JSON.stringify({ handles: handleStrs, inputProof: proofStr }, null, 2)
      );

      setBidStatus("submitting");

      const inputProof: `0x${string}` =
        typeof enc.inputProof === "string"
          ? (enc.inputProof as `0x${string}`)
          : (`0x${Buffer.from(enc.inputProof as Uint8Array).toString("hex")}` as `0x${string}`);

      const encryptedData: `0x${string}` =
        typeof enc.handles[0] === "string"
          ? (enc.handles[0] as `0x${string}`)
          : (`0x${Buffer.from(enc.handles[0] as Uint8Array).toString("hex")}` as `0x${string}`);

      writeContract({
        address: addr,
        abi: tenderAbi,
        functionName: "submitBid",
        args: [inputProof, encryptedData],
        value: parseEther(bondAmount),
      });

      setBidStatus("confirming");
    } catch (err) {
      setBidStatus("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Encryption failed"
      );
    }
  }

  if (isSuccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-14 h-14 rounded-lg bg-[#00E87B]/10 border border-[#00E87B]/20 flex items-center justify-center mx-auto">
            <CheckCircle size={28} className="text-[#00E87B]" />
          </div>
          <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
            Bid Submitted
          </h2>
          <p className="font-body text-[14px] text-[#888888]">
            Your encrypted bid has been submitted to Tender #{id}.
          </p>
          <p className="font-body text-[12px] text-[#666666] font-mono break-all">
            Tx: {hash}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Link
              href={`/tenders/${id}`}
              className="px-5 py-[10px] bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
            >
              View Tender
            </Link>
            <Link
              href="/bids"
              className="px-4 py-[10px] bg-[#0D0F14] border border-[#1E2230] text-[#888888] rounded-[6px] text-sm hover:border-[#00E87B]/30 transition-colors"
            >
              My Bids
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/tenders/${id}`}
          aria-label="Back to tender details"
          className="w-8 h-8 rounded-lg bg-[#0D0F14] border border-[#1E2230] flex items-center justify-center text-[#888888] hover:text-[#F0F0F0] hover:border-[#00E87B]/30 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
            Submit Bid — Tender #{id}
          </h1>
          <p className="font-body text-[14px] text-[#666666] mt-0.5">
            Your bid data will be FHE-encrypted before submission
          </p>
        </div>
      </div>

      {/* Status / Error Banner */}
      <div aria-live="assertive" role="status">
        {/* State Check */}
        {currentState !== undefined && currentState !== TenderState.BIDDING && (
          <div className="bg-[#FFB800]/10 border border-[#FFB800]/20 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle
              size={18}
              className="text-[#FFB800] mt-0.5 shrink-0"
            />
            <p className="font-body text-[14px] text-[#FFB800]">
              This tender is currently in &quot;{stateLabel(currentState)}&quot; state.
              Bidding may not be available.
            </p>
          </div>
        )}

        {/* Error */}
        {(errorMsg || writeError) && (
          <div className="bg-[#FF4444]/10 border border-[#FF4444]/20 rounded-lg p-4 flex items-start gap-3 mt-4">
            <AlertTriangle
              size={18}
              className="text-[#FF4444] mt-0.5 shrink-0"
            />
            <div>
              <p className="font-body text-[14px] text-[#FF4444] font-medium">Error</p>
              <p className="font-body text-[12px] text-[#888888] mt-1">
                {errorMsg || writeError?.message?.slice(0, 200)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Tender Info + Form */}
        <div className="flex flex-col gap-6">
          {/* Tender Info */}
          {config && (
            <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-3">
              <h3 className="font-body text-[14px] font-medium text-[#F0F0F0]">
                {config.description}
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Deadline</span>
                  <p className="font-body text-[12px] text-[#888888] mt-0.5">
                    {formatDeadlineFull(config.deadline)}
                  </p>
                </div>
                <div>
                  <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Max Bidders</span>
                  <p className="font-body text-[12px] text-[#888888] mt-0.5">{String(config.maxBidders)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Bid Form */}
          <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-5">
            <div className="flex items-center gap-2 font-body text-[14px] text-[#F0F0F0] font-medium">
              <Lock size={16} className="text-[#00E87B]" />
              Encrypted Bid Data
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="bidPrice" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                  Bid Price (USDC)
                </label>
                <input
                  id="bidPrice"
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="deliveryYears" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                  Delivery Timeline (Years)
                </label>
                <input
                  id="deliveryYears"
                  type="number"
                  min="1"
                  value={deliveryYears}
                  onChange={(e) => setDeliveryYears(e.target.value)}
                  placeholder="e.g. 2"
                  className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="pastProjects" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                  Past Projects
                </label>
                <input
                  id="pastProjects"
                  type="number"
                  min="0"
                  value={pastProjects}
                  onChange={(e) => setPastProjects(e.target.value)}
                  placeholder="e.g. 12"
                  className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="bondAmount" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                  Bond Amount (ETH)
                </label>
                <input
                  id="bondAmount"
                  type="number"
                  step="0.001"
                  value={bondAmount}
                  onChange={(e) => setBondAmount(e.target.value)}
                  placeholder="e.g. 0.1"
                  className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
                />
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={bidStatus !== "idle" && bidStatus !== "error"}
              aria-label={
                bidStatus === "encrypting"
                  ? "Encrypting bid with FHE"
                  : bidStatus === "submitting"
                  ? "Waiting for wallet confirmation"
                  : bidStatus === "confirming"
                  ? "Confirming transaction on-chain"
                  : "Encrypt and submit bid"
              }
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bidStatus === "encrypting" ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Encrypting with FHE...
                </>
              ) : bidStatus === "submitting" ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Confirm in Wallet...
                </>
              ) : bidStatus === "confirming" ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Confirming on-chain...
                </>
              ) : (
                <>
                  <Shield size={16} />
                  Encrypt & Submit Bid
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Encryption Preview */}
        <div className="flex flex-col gap-6">
          <div className="bg-[#0D0F14] border border-[#00E87B]/10 rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-2 font-body text-[14px] text-[#F0F0F0] font-medium">
              <Eye size={16} className="text-[#00E87B]" />
              Encryption Preview
            </div>

            <div className="bg-[#0C0D14] rounded-lg p-4 space-y-3 text-xs">
              <div>
                <span className="text-[#666666]">Protocol</span>
                <p className="text-[#00E87B] mt-0.5">Zama fhEVM (TFHE)</p>
              </div>
              <div>
                <span className="text-[#666666]">Encrypted Fields</span>
                <div className="mt-1 space-y-1">
                  <p className="text-[#888888]">
                    euint64 &middot; Price
                  </p>
                  <p className="text-[#888888]">
                    euint32 &middot; Delivery Years
                  </p>
                  <p className="text-[#888888]">
                    euint32 &middot; Past Projects
                  </p>
                  <p className="text-[#888888]">
                    euint64 &middot; Bond Amount
                  </p>
                </div>
              </div>

              {encryptedPreview && (
                <div>
                  <span className="text-[#666666]">Ciphertext</span>
                  <pre className="mt-1 text-[#00E87B]/70 whitespace-pre-wrap break-all font-mono text-[10px]">
                    {encryptedPreview}
                  </pre>
                </div>
              )}
            </div>

            <div className="font-body text-[12px] text-[#666666] space-y-1">
              <p>
                Your bid data is encrypted client-side before being sent to the
                smart contract.
              </p>
              <p>
                The encrypted ciphertext is stored on-chain. Only the contract
                can compute on the encrypted values during evaluation.
              </p>
            </div>
          </div>

          {/* Status Steps */}
          <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-3">
            <p className="font-body text-[14px] text-[#F0F0F0] font-medium">
              Submission Steps
            </p>
            {[
              {
                step: "encrypting",
                label: "FHE Encryption",
                desc: "Encrypting bid data client-side",
              },
              {
                step: "submitting",
                label: "Wallet Confirmation",
                desc: "Sign and submit transaction",
              },
              {
                step: "confirming",
                label: "On-Chain Confirmation",
                desc: "Waiting for block confirmation",
              },
            ].map((s) => {
              const isActive = bidStatus === s.step;
              const isDone =
                bidStatus === "success" ||
                (s.step === "encrypting" &&
                  ["submitting", "confirming", "success"].includes(bidStatus)) ||
                (s.step === "submitting" &&
                  ["confirming", "success"].includes(bidStatus));

              return (
                <div key={s.step} className="flex items-start gap-3">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      isDone
                        ? "bg-[#00E87B]/10 border border-[#00E87B]/20"
                        : isActive
                        ? "bg-[#FFB800]/10 border border-[#FFB800]/20"
                        : "bg-[#1E2230] border border-[#1E2230]"
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle size={12} className="text-[#00E87B]" />
                    ) : isActive ? (
                      <Loader2
                        size={12}
                        className="text-[#FFB800] animate-spin"
                      />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-[#555555]" />
                    )}
                  </div>
                  <div>
                    <p
                      className={`font-body text-[12px] font-medium ${
                        isDone
                          ? "text-[#00E87B]"
                          : isActive
                          ? "text-[#FFB800]"
                          : "text-[#666666]"
                      }`}
                    >
                      {s.label}
                    </p>
                    <p className="font-body text-[10px] text-[#555555]">{s.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={dismissToast} />
      )}
    </div>
  );
}
