"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseAbi, parseEther } from "viem";
import {
  AlertTriangle,
  Plus,
  X,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  Building2,
  User,
} from "lucide-react";
import {
  useDisputeCount,
  truncateAddr,
} from "@/hooks/useContractData";
import {
  ADDRESSES,
  DisputeManagerABI,
  DisputeType,
  DisputeStatus,
} from "@/lib/contracts";
import { Toast } from "@/components/Toast";

const disputeAbi = parseAbi(DisputeManagerABI);

function statusBadge(status: number) {
  switch (status) {
    case DisputeStatus.Open:
      return { label: "Pending", icon: Clock, color: "text-[#FFB800] bg-[#FFB800]/10 border-[#FFB800]/20" };
    case DisputeStatus.Slashed:
      return { label: "Resolved", icon: CheckCircle, color: "text-[#00E87B] bg-[#00E87B]/10 border-[#00E87B]/20" };
    case DisputeStatus.Dismissed:
      return { label: "Rejected", icon: XCircle, color: "text-[#FF4444] bg-[#FF4444]/10 border-[#FF4444]/20" };
    default:
      return { label: "Unknown", icon: Clock, color: "text-[#666666] bg-[#666666]/10 border-[#666666]/20" };
  }
}

export default function DisputesPage() {
  const [showModal, setShowModal] = useState(false);
  const [complaintType, setComplaintType] = useState<"company" | "citizen">("citizen");
  const [tenderId, setTenderId] = useState("");
  const [accused, setAccused] = useState("");
  const [reason, setReason] = useState("");

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const { data: disputeCount, isLoading: loadingCount } = useDisputeCount();
  const count = disputeCount ? Number(disputeCount) : 0;

  // Batch read all disputes
  const disputeContracts = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      address: ADDRESSES.DisputeManager,
      abi: disputeAbi,
      functionName: "getDispute" as const,
      args: [BigInt(i)] as const,
    }));
  }, [count]);

  const { data: disputeResults, isLoading: loadingDisputes } = useReadContracts({
    contracts: disputeContracts,
    query: { enabled: count > 0 },
  });

  const disputes = useMemo(() => {
    if (!disputeResults) return [];
    return disputeResults
      .map((r, i) => {
        if (r.status !== "success" || !Array.isArray(r.result)) return null;
        const [dtype, tid, complainant, accusedAddr, reas, status, filedAt] =
          r.result as [number, bigint, `0x${string}`, `0x${string}`, string, number, bigint];
        return {
          id: i,
          disputeType: dtype,
          tenderId: tid,
          complainant,
          accused: accusedAddr,
          reason: reas,
          status,
          filedAt,
        };
      })
      .filter(Boolean) as Array<{
      id: number;
      disputeType: number;
      tenderId: bigint;
      complainant: `0x${string}`;
      accused: `0x${string}`;
      reason: string;
      status: number;
      filedAt: bigint;
    }>;
  }, [disputeResults]);

  // Stats
  const pending = disputes.filter((d) => d.status === DisputeStatus.Open).length;
  const resolved = disputes.filter((d) => d.status === DisputeStatus.Slashed).length;
  const rejected = disputes.filter((d) => d.status === DisputeStatus.Dismissed).length;

  // File complaint
  const {
    writeContract,
    data: hash,
    isPending: isWriting,
    error: writeError,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      setToast({ message: "Complaint filed successfully!", type: "success" });
    }
  }, [isSuccess]);

  useEffect(() => {
    if (writeError) {
      setToast({ message: writeError.message.slice(0, 100), type: "error" });
    }
  }, [writeError]);

  function handleFileComplaint() {
    if (!tenderId || !accused || !reason) return;

    if (complaintType === "company") {
      writeContract({
        address: ADDRESSES.DisputeManager,
        abi: disputeAbi,
        functionName: "fileCompanyComplaint",
        args: [BigInt(tenderId), accused as `0x${string}`, reason],
        value: parseEther("0.01"),
      });
    } else {
      writeContract({
        address: ADDRESSES.DisputeManager,
        abi: disputeAbi,
        functionName: "fileCitizenComplaint",
        args: [BigInt(tenderId), accused as `0x${string}`, reason],
      });
    }
  }

  const isLoading = loadingCount || loadingDisputes;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
            Disputes
          </h1>
          <p className="font-body text-[14px] text-[#666666] mt-1">
            Procurement complaints and resolution tracking
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-[10px] bg-[#FF4444] text-white rounded-[6px] font-semibold text-sm hover:bg-[#FF4444]/90 transition-colors"
        >
          <Plus size={16} />
          File Complaint
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6">
          <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Total Disputes</span>
          {isLoading ? (
            <div className="h-10 w-8 bg-[#1E2230] rounded animate-pulse mt-3" />
          ) : (
            <p className="font-heading text-[36px] font-bold text-[#F0F0F0] mt-3">
              {count}
            </p>
          )}
        </div>
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6">
          <span className="font-heading text-[11px] font-semibold text-[#FFB800] tracking-[1px] uppercase">Pending</span>
          {isLoading ? (
            <div className="h-10 w-8 bg-[#1E2230] rounded animate-pulse mt-3" />
          ) : (
            <p className="font-heading text-[36px] font-bold text-[#FFB800] mt-3">
              {pending}
            </p>
          )}
        </div>
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6">
          <span className="font-heading text-[11px] font-semibold text-[#00E87B] tracking-[1px] uppercase">Resolved</span>
          {isLoading ? (
            <div className="h-10 w-8 bg-[#1E2230] rounded animate-pulse mt-3" />
          ) : (
            <p className="font-heading text-[36px] font-bold text-[#00E87B] mt-3">
              {resolved}
            </p>
          )}
        </div>
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6">
          <span className="font-heading text-[11px] font-semibold text-[#FF4444] tracking-[1px] uppercase">Rejected</span>
          {isLoading ? (
            <div className="h-10 w-8 bg-[#1E2230] rounded animate-pulse mt-3" />
          ) : (
            <p className="font-heading text-[36px] font-bold text-[#FF4444] mt-3">
              {rejected}
            </p>
          )}
        </div>
      </div>

      {/* Disputes Table */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg overflow-hidden">
        <div className="px-5 py-[14px] border-b border-[#1E2230]">
          <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
            All Disputes
          </h2>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-4 items-center">
                <div className="h-4 w-8 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-4 flex-1 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-5 w-16 bg-[#1E2230] rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : disputes.length === 0 ? (
          <div className="p-12 text-center">
            <AlertTriangle size={32} className="text-[#555555] mx-auto mb-3" />
            <p className="font-body text-[14px] text-[#666666]">No disputes filed yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1E2230]">
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">ID</th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Type</th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Tender</th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
                    Complainant
                  </th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Accused</th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Reason</th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Filed</th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => {
                  const badge = statusBadge(d.status);
                  const Icon = badge.icon;
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-[#1E2230] hover:bg-[#151820] transition-colors"
                    >
                      <td className="px-5 py-[14px] font-body text-[14px] text-[#888888] font-mono">
                        #{d.id}
                      </td>
                      <td className="px-5 py-[14px]">
                        <span className="flex items-center gap-1 text-xs text-[#888888]">
                          {d.disputeType === DisputeType.Company ? (
                            <Building2 size={12} />
                          ) : (
                            <User size={12} />
                          )}
                          {d.disputeType === DisputeType.Company
                            ? "Company"
                            : "Citizen"}
                        </span>
                      </td>
                      <td className="px-5 py-[14px] font-body text-[14px] text-[#888888] font-mono">
                        #{String(d.tenderId)}
                      </td>
                      <td className="px-5 py-[14px] font-body text-[12px] text-[#888888] font-mono">
                        {truncateAddr(d.complainant)}
                      </td>
                      <td className="px-5 py-[14px] font-body text-[12px] text-[#888888] font-mono">
                        {truncateAddr(d.accused)}
                      </td>
                      <td className="px-5 py-[14px] font-body text-[12px] text-[#888888] max-w-[200px] truncate">
                        {d.reason}
                      </td>
                      <td className="px-5 py-[14px] font-body text-[12px] text-[#666666]">
                        {new Date(Number(d.filedAt) * 1000).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-[14px]">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${badge.color}`}
                        >
                          <Icon size={10} />
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={dismissToast} />
      )}

      {/* File Complaint Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
                File Complaint
              </h3>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Close modal"
                className="text-[#666666] hover:text-[#F0F0F0] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {isSuccess ? (
              <div aria-live="polite" role="status" className="text-center space-y-3 py-4">
                <CheckCircle size={32} className="text-[#00E87B] mx-auto" />
                <p className="font-body text-[14px] text-[#F0F0F0]">Complaint filed successfully</p>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setTenderId("");
                    setAccused("");
                    setReason("");
                  }}
                  className="font-body text-[14px] text-[#00E87B]"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                {/* Type */}
                <div>
                  <label id="complaintTypeLabel" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                    Complaint Type
                  </label>
                  <div className="flex gap-2" role="group" aria-labelledby="complaintTypeLabel">
                    <button
                      onClick={() => setComplaintType("citizen")}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-[6px] text-xs font-medium border transition-colors ${
                        complaintType === "citizen"
                          ? "bg-[#00E87B]/10 text-[#00E87B] border-[#00E87B]/20"
                          : "bg-[#0C0D14] text-[#888888] border-[#1E2230]"
                      }`}
                    >
                      <User size={14} />
                      Citizen (Free)
                    </button>
                    <button
                      onClick={() => setComplaintType("company")}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-[6px] text-xs font-medium border transition-colors ${
                        complaintType === "company"
                          ? "bg-[#4A9FFF]/10 text-[#4A9FFF] border-[#4A9FFF]/20"
                          : "bg-[#0C0D14] text-[#888888] border-[#1E2230]"
                      }`}
                    >
                      <Building2 size={14} />
                      Company (0.01 ETH)
                    </button>
                  </div>
                </div>

                {/* Tender ID */}
                <div>
                  <label htmlFor="disputeTenderId" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                    Tender ID
                  </label>
                  <input
                    id="disputeTenderId"
                    type="number"
                    min="0"
                    value={tenderId}
                    onChange={(e) => setTenderId(e.target.value)}
                    placeholder="e.g. 0"
                    className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
                  />
                </div>

                {/* Accused */}
                <div>
                  <label htmlFor="accusedAddress" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                    Accused Address
                  </label>
                  <input
                    id="accusedAddress"
                    type="text"
                    value={accused}
                    onChange={(e) => setAccused(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors font-mono"
                  />
                </div>

                {/* Reason */}
                <div>
                  <label htmlFor="disputeReason" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                    Reason
                  </label>
                  <textarea
                    id="disputeReason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Describe the complaint..."
                    rows={3}
                    className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors resize-none"
                  />
                </div>

                {writeError && (
                  <div aria-live="assertive" role="alert">
                    <p className="text-xs text-[#FF4444]">
                      {writeError.message.slice(0, 150)}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleFileComplaint}
                  disabled={isWriting || isConfirming || !tenderId || !accused || !reason}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FF4444] text-white rounded-[6px] font-semibold text-sm hover:bg-[#FF4444]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isWriting || isConfirming ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {isWriting ? "Confirm in Wallet..." : "Confirming..."}
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={16} />
                      Submit Complaint
                      {complaintType === "company" && " (0.01 ETH)"}
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
