"use client";

import { useState } from "react";
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseAbi } from "viem";
import {
  TrendingUp,
  Plus,
  X,
  Loader2,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  DollarSign,
} from "lucide-react";
import { ADDRESSES, PriceEscalationABI } from "@/lib/contracts";
import { useTenderCount, formatUsd } from "@/hooks/useContractData";

const escalationAbi = parseAbi(PriceEscalationABI);

export default function EscalationPage() {
  const [selectedTender, setSelectedTender] = useState("0");
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [materialName, setMaterialName] = useState("");
  const [baselinePrice, setBaselinePrice] = useState("");
  const [checkMaterial, setCheckMaterial] = useState("");

  const { data: tenderCount } = useTenderCount();
  const count = tenderCount ? Number(tenderCount) : 0;

  const tenderId = BigInt(selectedTender || "0");

  // Read escalation data for selected tender
  const { data: totalPaid, isLoading: loadingPaid } = useReadContract({
    address: ADDRESSES.PriceEscalation,
    abi: escalationAbi,
    functionName: "totalEscalationPaid",
    args: [tenderId],
  });

  const { data: tenderPrice, isLoading: loadingPrice } = useReadContract({
    address: ADDRESSES.PriceEscalation,
    abi: escalationAbi,
    functionName: "tenderPrice",
    args: [tenderId],
  });

  const { data: threshold } = useReadContract({
    address: ADDRESSES.PriceEscalation,
    abi: escalationAbi,
    functionName: "escalationThreshold",
  });

  // Material price check
  const { data: basePrice } = useReadContract({
    address: ADDRESSES.PriceEscalation,
    abi: escalationAbi,
    functionName: "getBaselinePrice",
    args: [tenderId, checkMaterial],
    query: { enabled: !!checkMaterial },
  });

  const { data: latestPrice } = useReadContract({
    address: ADDRESSES.PriceEscalation,
    abi: escalationAbi,
    functionName: "getLatestPrice",
    args: [tenderId, checkMaterial],
    query: { enabled: !!checkMaterial },
  });

  // Track material
  const {
    writeContract: writeTrack,
    data: trackHash,
    isPending: isTracking,
    error: trackError,
  } = useWriteContract();

  const { isLoading: trackConfirming, isSuccess: trackSuccess } =
    useWaitForTransactionReceipt({ hash: trackHash });

  // Evaluate
  const {
    writeContract: writeEvaluate,
    data: evalHash,
    isPending: isEvaluating,
  } = useWriteContract();

  const { isLoading: evalConfirming, isSuccess: evalSuccess } =
    useWaitForTransactionReceipt({ hash: evalHash });

  function handleTrackMaterial() {
    if (!materialName || !baselinePrice) return;
    writeTrack({
      address: ADDRESSES.PriceEscalation,
      abi: escalationAbi,
      functionName: "trackMaterial",
      args: [tenderId, materialName, BigInt(baselinePrice)],
    });
  }

  function handleEvaluate() {
    writeEvaluate({
      address: ADDRESSES.PriceEscalation,
      abi: escalationAbi,
      functionName: "evaluateEscalation",
      args: [tenderId],
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
            Price Escalation
          </h1>
          <p className="font-body text-[14px] text-[#666666] mt-1">
            Track material price changes and evaluate escalation claims
          </p>
        </div>
        <button
          onClick={() => setShowTrackModal(true)}
          className="flex items-center gap-2 px-5 py-[10px] bg-[#FFB800] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#FFB800]/90 transition-colors"
        >
          <Plus size={16} />
          Track Material
        </button>
      </div>

      {/* Tender Selector */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6">
        <label htmlFor="selectTender" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-2">
          Select Tender
        </label>
        <select
          id="selectTender"
          value={selectedTender}
          onChange={(e) => setSelectedTender(e.target.value)}
          className="w-full md:w-64 px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
        >
          {Array.from({ length: count }, (_, i) => (
            <option key={i} value={String(i)}>
              Tender #{i}
            </option>
          ))}
          {count === 0 && <option value="0">No tenders available</option>}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={14} className="text-[#666666]" />
            <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
              Total Escalation Paid
            </span>
          </div>
          {loadingPaid ? (
            <div className="h-10 w-24 bg-[#1E2230] rounded animate-pulse" />
          ) : (
            <p className="font-heading text-[36px] font-bold text-[#FFB800] font-mono">
              {formatUsd(totalPaid as bigint | undefined)}
            </p>
          )}
        </div>
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={14} className="text-[#666666]" />
            <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
              Tender Price
            </span>
          </div>
          {loadingPrice ? (
            <div className="h-10 w-24 bg-[#1E2230] rounded animate-pulse" />
          ) : (
            <p className="font-heading text-[36px] font-bold text-[#F0F0F0] font-mono">
              {formatUsd(tenderPrice as bigint | undefined)}
            </p>
          )}
        </div>
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-[#666666]" />
            <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
              Threshold
            </span>
          </div>
          <p className="font-heading text-[36px] font-bold text-[#888888]">
            {threshold !== undefined ? `${String(threshold)}%` : "--"}
          </p>
        </div>
      </div>

      {/* Material Check */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-4">
        <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
          Check Material Price
        </h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label htmlFor="checkMaterialName" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
              Material Name
            </label>
            <input
              id="checkMaterialName"
              type="text"
              value={checkMaterial}
              onChange={(e) => setCheckMaterial(e.target.value)}
              placeholder="e.g. Steel, Cement, Lumber"
              className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
            />
          </div>
        </div>

        {checkMaterial && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#0C0D14] rounded-lg p-4">
              <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Baseline Price</span>
              <p className="font-heading text-[20px] font-bold text-[#F0F0F0] font-mono mt-1">
                {basePrice !== undefined ? String(basePrice) : "0"}
              </p>
            </div>
            <div className="bg-[#0C0D14] rounded-lg p-4">
              <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Latest Price</span>
              <p className="font-heading text-[20px] font-bold text-[#F0F0F0] font-mono mt-1">
                {latestPrice !== undefined ? String(latestPrice) : "0"}
              </p>
              {basePrice && latestPrice && Number(basePrice) > 0 && (
                <p
                  className={`font-body text-[12px] mt-1 ${
                    Number(latestPrice) > Number(basePrice)
                      ? "text-[#FF4444]"
                      : "text-[#00E87B]"
                  }`}
                >
                  {(
                    ((Number(latestPrice) - Number(basePrice)) /
                      Number(basePrice)) *
                    100
                  ).toFixed(1)}
                  % change
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Evaluate Button */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-4">
        <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
          Evaluate Escalation
        </h2>
        <p className="font-body text-[12px] text-[#666666]">
          Trigger escalation evaluation for Tender #{selectedTender}. This will check all
          tracked materials against the threshold and process payments if applicable.
        </p>

        {evalSuccess && (
          <div className="bg-[#00E87B]/10 border border-[#00E87B]/20 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle size={14} className="text-[#00E87B]" />
            <span className="font-body text-[12px] text-[#00E87B]">
              Escalation evaluated successfully
            </span>
          </div>
        )}

        <button
          onClick={handleEvaluate}
          disabled={isEvaluating || evalConfirming}
          className="flex items-center gap-2 px-5 py-[10px] bg-[#4A9FFF] text-white rounded-[6px] font-semibold text-sm hover:bg-[#4A9FFF]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isEvaluating || evalConfirming ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {isEvaluating ? "Confirm..." : "Evaluating..."}
            </>
          ) : (
            <>
              <TrendingUp size={16} />
              Evaluate Escalation
            </>
          )}
        </button>
      </div>

      {/* Track Material Modal */}
      {showTrackModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
                Track Material
              </h3>
              <button
                onClick={() => setShowTrackModal(false)}
                aria-label="Close modal"
                className="text-[#666666] hover:text-[#F0F0F0] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {trackSuccess ? (
              <div className="text-center space-y-3 py-4">
                <CheckCircle size={32} className="text-[#00E87B] mx-auto" />
                <p className="font-body text-[14px] text-[#F0F0F0]">
                  Material tracked successfully
                </p>
                <button
                  onClick={() => {
                    setShowTrackModal(false);
                    setMaterialName("");
                    setBaselinePrice("");
                  }}
                  className="font-body text-[14px] text-[#00E87B]"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="trackMaterialName" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                    Material Name
                  </label>
                  <input
                    id="trackMaterialName"
                    type="text"
                    value={materialName}
                    onChange={(e) => setMaterialName(e.target.value)}
                    placeholder="e.g. Steel Rebar"
                    className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="trackBaselinePrice" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                    Baseline Price (wei)
                  </label>
                  <input
                    id="trackBaselinePrice"
                    type="number"
                    value={baselinePrice}
                    onChange={(e) => setBaselinePrice(e.target.value)}
                    placeholder="e.g. 1000000000000000000"
                    className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors font-mono"
                  />
                </div>

                <p className="font-body text-[12px] text-[#666666]">
                  Tender #{selectedTender} will be tracked
                </p>

                {trackError && (
                  <p className="text-xs text-[#FF4444]">
                    {trackError.message.slice(0, 150)}
                  </p>
                )}

                <button
                  onClick={handleTrackMaterial}
                  disabled={isTracking || trackConfirming || !materialName || !baselinePrice}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FFB800] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#FFB800]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTracking || trackConfirming ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {isTracking ? "Confirm..." : "Tracking..."}
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Track Material
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
