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
          <div className="w-14 h-14 rounded-2xl bg-[#00E87B]/10 border border-[#00E87B]/20 flex items-center justify-center mx-auto">
            <CheckCircle size={28} className="text-[#00E87B]" />
          </div>
          <h2 className="text-xl font-heading font-semibold text-[#F0F2F5]">
            Tender Created
          </h2>
          <p className="text-sm text-[#A0A8B8]">
            Your encrypted procurement tender has been deployed on-chain.
          </p>
          <p className="text-xs text-[#6B7280] font-mono break-all">
            Tx: {hash}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Link
              href="/tenders"
              className="px-4 py-2.5 bg-[#00E87B] text-[#08090E] rounded-lg font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
            >
              View All Tenders
            </Link>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2.5 bg-[#0F1117] border border-[#1A1D27] text-[#A0A8B8] rounded-lg text-sm hover:border-[#00E87B]/30 transition-colors"
            >
              Dashboard
            </button>
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
          href="/tenders"
          className="w-8 h-8 rounded-lg bg-[#0F1117] border border-[#1A1D27] flex items-center justify-center text-[#A0A8B8] hover:text-[#F0F2F5] hover:border-[#00E87B]/30 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#F0F2F5]">
            Create Tender
          </h1>
          <p className="text-sm text-[#6B7280] mt-0.5">
            Deploy a new FHE-encrypted procurement tender
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {writeError && (
        <div className="bg-[#FF4444]/10 border border-[#FF4444]/20 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-[#FF4444] mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-[#FF4444] font-medium">
              Transaction Failed
            </p>
            <p className="text-xs text-[#A0A8B8] mt-1">
              {writeError.message.slice(0, 200)}
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Basic Info */}
        <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2 text-sm text-[#F0F2F5] font-medium">
            <FileText size={16} className="text-[#00E87B]" />
            Basic Information
          </div>

          <div className="space-y-4">
            {/* Description */}
            <div>
              <label className="block text-xs text-[#6B7280] mb-1.5 uppercase tracking-wider">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the procurement requirements..."
                rows={4}
                className={`w-full px-3 py-2.5 bg-[#0C0D14] border rounded-lg text-sm text-[#F0F2F5] placeholder-[#3A3F4B] focus:outline-none transition-colors resize-none ${
                  errors.description
                    ? "border-[#FF4444]/50 focus:border-[#FF4444]"
                    : "border-[#1A1D27] focus:border-[#00E87B]/30"
                }`}
              />
              {errors.description && (
                <p className="text-xs text-[#FF4444] mt-1">
                  {errors.description}
                </p>
              )}
            </div>

            {/* Deadline */}
            <div>
              <label className="block text-xs text-[#6B7280] mb-1.5 uppercase tracking-wider">
                <Calendar size={12} className="inline mr-1" />
                Bidding Deadline
              </label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className={`w-full px-3 py-2.5 bg-[#0C0D14] border rounded-lg text-sm text-[#F0F2F5] focus:outline-none transition-colors ${
                  errors.deadline
                    ? "border-[#FF4444]/50 focus:border-[#FF4444]"
                    : "border-[#1A1D27] focus:border-[#00E87B]/30"
                }`}
              />
              {errors.deadline && (
                <p className="text-xs text-[#FF4444] mt-1">
                  {errors.deadline}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Criteria + Deploy */}
        <div className="space-y-6">
          <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2 text-sm text-[#F0F2F5] font-medium">
              <Users size={16} className="text-[#4A9FFF]" />
              Bid Criteria
            </div>

            <div>
              <label className="block text-xs text-[#6B7280] mb-1.5 uppercase tracking-wider">
                Max Bidders
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxBidders}
                onChange={(e) => setMaxBidders(e.target.value)}
                className={`w-full px-3 py-2.5 bg-[#0C0D14] border rounded-lg text-sm text-[#F0F2F5] focus:outline-none transition-colors ${
                  errors.maxBidders
                    ? "border-[#FF4444]/50 focus:border-[#FF4444]"
                    : "border-[#1A1D27] focus:border-[#00E87B]/30"
                }`}
              />
              {errors.maxBidders && (
                <p className="text-xs text-[#FF4444] mt-1">
                  {errors.maxBidders}
                </p>
              )}
              <p className="text-xs text-[#6B7280] mt-1">
                Maximum number of encrypted bids accepted (1-10)
              </p>
            </div>
          </div>

          {/* Deploy */}
          <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm text-[#F0F2F5] font-medium">
              <Rocket size={16} className="text-[#FFB800]" />
              Deploy Tender
            </div>

            <div className="bg-[#0C0D14] rounded-lg p-3 space-y-2 text-xs">
              <div className="flex justify-between text-[#6B7280]">
                <span>Network</span>
                <span className="text-[#A0A8B8]">Sepolia</span>
              </div>
              <div className="flex justify-between text-[#6B7280]">
                <span>Encryption</span>
                <span className="text-[#00E87B]">Zama fhEVM</span>
              </div>
              <div className="flex justify-between text-[#6B7280]">
                <span>Factory</span>
                <span className="text-[#A0A8B8] font-mono">
                  {ADDRESSES.TenderFactory.slice(0, 10)}...
                </span>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isWriting || isConfirming}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#00E87B] text-[#08090E] rounded-lg font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
