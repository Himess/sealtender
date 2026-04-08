"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseAbi } from "viem";
import { ADDRESSES, TenderFactoryABI } from "@/lib/contracts";
import {
  ArrowLeft,
  FileText,
  Calendar,
  Users,
  Rocket,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import Link from "next/link";

const factoryAbi = parseAbi(TenderFactoryABI);

export default function CreateTenderPage() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [maxBidders, setMaxBidders] = useState("5");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const {
    writeContract,
    data: hash,
    isPending: isWriting,
    error: writeError,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash });

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!description.trim()) {
      errs.description = "Description is required";
    }

    if (!deadline) {
      errs.deadline = "Deadline is required";
    } else {
      const dl = new Date(deadline).getTime() / 1000;
      if (dl <= Date.now() / 1000) {
        errs.deadline = "Deadline must be in the future";
      }
    }

    const mb = parseInt(maxBidders);
    if (isNaN(mb) || mb < 1 || mb > 10) {
      errs.maxBidders = "Max bidders must be between 1 and 10";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;

    const deadlineUnix = BigInt(
      Math.floor(new Date(deadline).getTime() / 1000)
    );

    writeContract({
      address: ADDRESSES.TenderFactory,
      abi: factoryAbi,
      functionName: "createTender",
      args: [description, deadlineUnix, parseInt(maxBidders)],
    });
  }

  if (isSuccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-14 h-14 rounded-lg bg-[#00E87B]/10 border border-[#00E87B]/20 flex items-center justify-center mx-auto">
            <CheckCircle size={28} className="text-[#00E87B]" />
          </div>
          <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
            Tender Created
          </h2>
          <p className="font-body text-[14px] text-[#888888]">
            Your encrypted procurement tender has been deployed on-chain.
          </p>
          <p className="font-body text-[12px] text-[#666666] font-mono break-all">
            Tx: {hash}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Link
              href="/tenders"
              className="px-5 py-[10px] bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
            >
              View All Tenders
            </Link>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-[10px] bg-[#0D0F14] border border-[#1E2230] text-[#888888] rounded-[6px] text-sm hover:border-[#00E87B]/30 transition-colors"
            >
              Dashboard
            </button>
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
          href="/tenders"
          aria-label="Back to tenders"
          className="w-8 h-8 rounded-lg bg-[#0D0F14] border border-[#1E2230] flex items-center justify-center text-[#888888] hover:text-[#F0F0F0] hover:border-[#00E87B]/30 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
            Create Tender
          </h1>
          <p className="font-body text-[14px] text-[#666666] mt-0.5">
            Deploy a new FHE-encrypted procurement tender
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {writeError && (
        <div className="bg-[#FF4444]/10 border border-[#FF4444]/20 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-[#FF4444] mt-0.5 shrink-0" />
          <div>
            <p className="font-body text-[14px] text-[#FF4444] font-medium">
              Transaction Failed
            </p>
            <p className="font-body text-[12px] text-[#888888] mt-1">
              {writeError.message.slice(0, 200)}
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Basic Info */}
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-5">
          <div className="flex items-center gap-2 font-body text-[14px] text-[#F0F0F0] font-medium">
            <FileText size={16} className="text-[#00E87B]" />
            Basic Information
          </div>

          <div className="space-y-4">
            {/* Description */}
            <div>
              <label htmlFor="description" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the procurement requirements..."
                rows={4}
                className={`w-full px-3 py-2.5 bg-[#0C0D14] border rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none transition-colors resize-none ${
                  errors.description
                    ? "border-[#FF4444]/50 focus:border-[#FF4444]"
                    : "border-[#1E2230] focus:border-[#00E87B]/30"
                }`}
              />
              {errors.description && (
                <p className="font-body text-[12px] text-[#FF4444] mt-1">
                  {errors.description}
                </p>
              )}
            </div>

            {/* Deadline */}
            <div>
              <label htmlFor="deadline" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                <Calendar size={12} className="inline mr-1" />
                Bidding Deadline
              </label>
              <input
                id="deadline"
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className={`w-full px-3 py-2.5 bg-[#0C0D14] border rounded-lg font-body text-[14px] text-[#F0F0F0] focus:outline-none transition-colors ${
                  errors.deadline
                    ? "border-[#FF4444]/50 focus:border-[#FF4444]"
                    : "border-[#1E2230] focus:border-[#00E87B]/30"
                }`}
              />
              {errors.deadline && (
                <p className="font-body text-[12px] text-[#FF4444] mt-1">
                  {errors.deadline}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Criteria + Deploy */}
        <div className="flex flex-col gap-6">
          <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-5">
            <div className="flex items-center gap-2 font-body text-[14px] text-[#F0F0F0] font-medium">
              <Users size={16} className="text-[#4A9FFF]" />
              Bid Criteria
            </div>

            <div>
              <label htmlFor="maxBidders" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                Max Bidders
              </label>
              <input
                id="maxBidders"
                type="number"
                min={1}
                max={10}
                value={maxBidders}
                onChange={(e) => setMaxBidders(e.target.value)}
                className={`w-full px-3 py-2.5 bg-[#0C0D14] border rounded-lg font-body text-[14px] text-[#F0F0F0] focus:outline-none transition-colors ${
                  errors.maxBidders
                    ? "border-[#FF4444]/50 focus:border-[#FF4444]"
                    : "border-[#1E2230] focus:border-[#00E87B]/30"
                }`}
              />
              {errors.maxBidders && (
                <p className="font-body text-[12px] text-[#FF4444] mt-1">
                  {errors.maxBidders}
                </p>
              )}
              <p className="font-body text-[12px] text-[#666666] mt-1">
                Maximum number of encrypted bids accepted (1-10)
              </p>
            </div>
          </div>

          {/* Deploy */}
          <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-2 font-body text-[14px] text-[#F0F0F0] font-medium">
              <Rocket size={16} className="text-[#FFB800]" />
              Deploy Tender
            </div>

            <div className="bg-[#0C0D14] rounded-lg p-3 space-y-2 text-xs">
              <div className="flex justify-between text-[#666666]">
                <span>Network</span>
                <span className="text-[#888888]">Sepolia</span>
              </div>
              <div className="flex justify-between text-[#666666]">
                <span>Encryption</span>
                <span className="text-[#00E87B]">Zama fhEVM</span>
              </div>
              <div className="flex justify-between text-[#666666]">
                <span>Factory</span>
                <span className="text-[#888888] font-mono">
                  {ADDRESSES.TenderFactory.slice(0, 10)}...
                </span>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isWriting || isConfirming}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isWriting || isConfirming ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {isWriting ? "Confirm in Wallet..." : "Confirming..."}
                </>
              ) : (
                <>
                  <Rocket size={16} />
                  Deploy Tender Contract
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
