"use client";

import { use, useState } from "react";
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
} from "@/hooks/useContractData";
import { EncryptedTenderABI, TenderState } from "@/lib/contracts";
import { encryptBidData } from "@/lib/fhevm";

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

  const {
    writeContract,
    data: hash,
    error: writeError,
  } = useWriteContract();

  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  const config = configData
    ? {
        description: (configData as readonly unknown[])[0] as string,
        deadline: (configData as readonly unknown[])[1] as bigint,
        maxBidders: Number((configData as readonly unknown[])[2]),
        creator: (configData as readonly unknown[])[3] as `0x${string}`,
      }
    : null;

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
          <div className="w-14 h-14 rounded-2xl bg-[#00E87B]/10 border border-[#00E87B]/20 flex items-center justify-center mx-auto">
            <CheckCircle size={28} className="text-[#00E87B]" />
          </div>
          <h2 className="text-xl font-heading font-semibold text-[#F0F2F5]">
            Bid Submitted
          </h2>
          <p className="text-sm text-[#A0A8B8]">
            Your encrypted bid has been submitted to Tender #{id}.
          </p>
          <p className="text-xs text-[#6B7280] font-mono break-all">
            Tx: {hash}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Link
              href={`/tenders/${id}`}
              className="px-4 py-2.5 bg-[#00E87B] text-[#08090E] rounded-lg font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
            >
              View Tender
            </Link>
            <Link
              href="/bids"
              className="px-4 py-2.5 bg-[#0F1117] border border-[#1A1D27] text-[#A0A8B8] rounded-lg text-sm hover:border-[#00E87B]/30 transition-colors"
            >
              My Bids
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/tenders/${id}`}
          className="w-8 h-8 rounded-lg bg-[#0F1117] border border-[#1A1D27] flex items-center justify-center text-[#A0A8B8] hover:text-[#F0F2F5] hover:border-[#00E87B]/30 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#F0F2F5]">
            Submit Bid — Tender #{id}
          </h1>
          <p className="text-sm text-[#6B7280] mt-0.5">
            Your bid data will be FHE-encrypted before submission
          </p>
        </div>
      </div>

      {/* State Check */}
      {currentState !== undefined && currentState !== TenderState.BIDDING && (
        <div className="bg-[#FFB800]/10 border border-[#FFB800]/20 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle
            size={18}
            className="text-[#FFB800] mt-0.5 shrink-0"
          />
          <p className="text-sm text-[#FFB800]">
            This tender is currently in &quot;{stateLabel(currentState)}&quot; state.
            Bidding may not be available.
          </p>
        </div>
      )}

      {/* Error */}
      {(errorMsg || writeError) && (
        <div className="bg-[#FF4444]/10 border border-[#FF4444]/20 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle
            size={18}
            className="text-[#FF4444] mt-0.5 shrink-0"
          />
          <div>
            <p className="text-sm text-[#FF4444] font-medium">Error</p>
            <p className="text-xs text-[#A0A8B8] mt-1">
              {errorMsg || writeError?.message?.slice(0, 200)}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Tender Info + Form */}
        <div className="space-y-6">
          {/* Tender Info */}
          {config && (
            <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-medium text-[#F0F2F5]">
                {config.description}
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[#6B7280]">Deadline</span>
                  <p className="text-[#A0A8B8] mt-0.5">
                    {formatDeadlineFull(config.deadline)}
                  </p>
                </div>
                <div>
                  <span className="text-[#6B7280]">Max Bidders</span>
                  <p className="text-[#A0A8B8] mt-0.5">{config.maxBidders}</p>
                </div>
              </div>
            </div>
          )}

          {/* Bid Form */}
          <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2 text-sm text-[#F0F2F5] font-medium">
              <Lock size={16} className="text-[#00E87B]" />
              Encrypted Bid Data
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[#6B7280] mb-1.5 uppercase tracking-wider">
                  Bid Price (USDC)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1A1D27] rounded-lg text-sm text-[#F0F2F5] placeholder-[#3A3F4B] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-[#6B7280] mb-1.5 uppercase tracking-wider">
                  Delivery Timeline (Years)
                </label>
                <input
                  type="number"
                  min="1"
                  value={deliveryYears}
                  onChange={(e) => setDeliveryYears(e.target.value)}
                  placeholder="e.g. 2"
                  className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1A1D27] rounded-lg text-sm text-[#F0F2F5] placeholder-[#3A3F4B] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-[#6B7280] mb-1.5 uppercase tracking-wider">
                  Past Projects
                </label>
                <input
                  type="number"
                  min="0"
                  value={pastProjects}
                  onChange={(e) => setPastProjects(e.target.value)}
                  placeholder="e.g. 12"
                  className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1A1D27] rounded-lg text-sm text-[#F0F2F5] placeholder-[#3A3F4B] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-[#6B7280] mb-1.5 uppercase tracking-wider">
                  Bond Amount (ETH)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={bondAmount}
                  onChange={(e) => setBondAmount(e.target.value)}
                  placeholder="e.g. 0.1"
                  className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1A1D27] rounded-lg text-sm text-[#F0F2F5] placeholder-[#3A3F4B] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
                />
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={bidStatus !== "idle" && bidStatus !== "error"}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#00E87B] text-[#08090E] rounded-lg font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="space-y-6">
          <div className="bg-[#0F1117] border border-[#00E87B]/10 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm text-[#F0F2F5] font-medium">
              <Eye size={16} className="text-[#00E87B]" />
              Encryption Preview
            </div>

            <div className="bg-[#0C0D14] rounded-lg p-4 space-y-3 text-xs">
              <div>
                <span className="text-[#6B7280]">Protocol</span>
                <p className="text-[#00E87B] mt-0.5">Zama fhEVM (TFHE)</p>
              </div>
              <div>
                <span className="text-[#6B7280]">Encrypted Fields</span>
                <div className="mt-1 space-y-1">
                  <p className="text-[#A0A8B8]">
                    euint64 &middot; Price
                  </p>
                  <p className="text-[#A0A8B8]">
                    euint32 &middot; Delivery Years
                  </p>
                  <p className="text-[#A0A8B8]">
                    euint32 &middot; Past Projects
                  </p>
                  <p className="text-[#A0A8B8]">
                    euint64 &middot; Bond Amount
                  </p>
                </div>
              </div>

              {encryptedPreview && (
                <div>
                  <span className="text-[#6B7280]">Ciphertext</span>
                  <pre className="mt-1 text-[#00E87B]/70 whitespace-pre-wrap break-all font-mono text-[10px]">
                    {encryptedPreview}
                  </pre>
                </div>
              )}
            </div>

            <div className="text-xs text-[#6B7280] space-y-1">
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
          <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-6 space-y-3">
            <p className="text-sm text-[#F0F2F5] font-medium">
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
                        : "bg-[#1A1D27] border border-[#1A1D27]"
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
                      <div className="w-2 h-2 rounded-full bg-[#3A3F4B]" />
                    )}
                  </div>
                  <div>
                    <p
                      className={`text-xs font-medium ${
                        isDone
                          ? "text-[#00E87B]"
                          : isActive
                          ? "text-[#FFB800]"
                          : "text-[#6B7280]"
                      }`}
                    >
                      {s.label}
                    </p>
                    <p className="text-[10px] text-[#3A3F4B]">{s.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
