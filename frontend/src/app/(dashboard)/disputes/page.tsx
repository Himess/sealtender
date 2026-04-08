"use client";

import { useState, useMemo } from "react";
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

const disputeAbi = parseAbi(DisputeManagerABI);

function statusBadge(status: number) {
  switch (status) {
    case DisputeStatus.PENDING:
      return { label: "Pending", icon: Clock, color: "text-[#FFB800] bg-[#FFB800]/10 border-[#FFB800]/20" };
    case DisputeStatus.RESOLVED:
      return { label: "Resolved", icon: CheckCircle, color: "text-[#00E87B] bg-[#00E87B]/10 border-[#00E87B]/20" };
    case DisputeStatus.REJECTED:
      return { label: "Rejected", icon: XCircle, color: "text-[#FF4444] bg-[#FF4444]/10 border-[#FF4444]/20" };
    default:
      return { label: "Unknown", icon: Clock, color: "text-[#6B7280] bg-[#6B7280]/10 border-[#6B7280]/20" };
  }
}

export default function DisputesPage() {
  const [showModal, setShowModal] = useState(false);
  const [complaintType, setComplaintType] = useState<"company" | "citizen">("citizen");
  const [tenderId, setTenderId] = useState("");
  const [accused, setAccused] = useState("");
  const [reason, setReason] = useState("");

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
  const pending = disputes.filter((d) => d.status === DisputeStatus.PENDING).length;
  const resolved = disputes.filter((d) => d.status === DisputeStatus.RESOLVED).length;
  const rejected = disputes.filter((d) => d.status === DisputeStatus.REJECTED).length;

  // File complaint
  const {
    writeContract,
    data: hash,
    isPending: isWriting,
    error: writeError,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#F0F2F5]">
            Disputes
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Procurement complaints and resolution tracking
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#FF4444] text-white rounded-lg font-semibold text-sm hover:bg-[#FF4444]/90 transition-colors"
        >
          <Plus size={16} />
          File Complaint
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-5">
          <span className="text-xs text-[#6B7280]">Total Disputes</span>
          {isLoading ? (
            <div className="h-7 w-8 bg-[#1A1D27] rounded animate-pulse mt-2" />
          ) : (
            <p className="text-2xl font-heading font-bold text-[#F0F2F5] mt-1">
              {count}
            </p>
          )}
        </div>
        <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-5">
          <span className="text-xs text-[#FFB800]">Pending</span>
          {isLoading ? (
            <div className="h-7 w-8 bg-[#1A1D27] rounded animate-pulse mt-2" />
          ) : (
            <p className="text-2xl font-heading font-bold text-[#FFB800] mt-1">
              {pending}
            </p>
          )}
        </div>
        <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-5">
          <span className="text-xs text-[#00E87B]">Resolved</span>
          {isLoading ? (
            <div className="h-7 w-8 bg-[#1A1D27] rounded animate-pulse mt-2" />
          ) : (
            <p className="text-2xl font-heading font-bold text-[#00E87B] mt-1">
              {resolved}
            </p>
          )}
        </div>
        <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-5">
          <span className="text-xs text-[#FF4444]">Rejected</span>
          {isLoading ? (
            <div className="h-7 w-8 bg-[#1A1D27] rounded animate-pulse mt-2" />
          ) : (
            <p className="text-2xl font-heading font-bold text-[#FF4444] mt-1">
              {rejected}
            </p>
          )}
        </div>
      </div>

      {/* Disputes Table */}
      <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1A1D27]">
          <h2 className="text-base font-heading font-semibold text-[#F0F2F5]">
            All Disputes
          </h2>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-4 items-center">
                <div className="h-4 w-8 bg-[#1A1D27] rounded animate-pulse" />
                <div className="h-4 flex-1 bg-[#1A1D27] rounded animate-pulse" />
                <div className="h-5 w-16 bg-[#1A1D27] rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : disputes.length === 0 ? (
          <div className="p-12 text-center">
            <AlertTriangle size={32} className="text-[#3A3F4B] mx-auto mb-3" />
            <p className="text-sm text-[#6B7280]">No disputes filed yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-[#6B7280] uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium">ID</th>
                  <th className="text-left px-5 py-3 font-medium">Type</th>
                  <th className="text-left px-5 py-3 font-medium">Tender</th>
                  <th className="text-left px-5 py-3 font-medium">
                    Complainant
                  </th>
                  <th className="text-left px-5 py-3 font-medium">Accused</th>
                  <th className="text-left px-5 py-3 font-medium">Reason</th>
                  <th className="text-left px-5 py-3 font-medium">Filed</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => {
                  const badge = statusBadge(d.status);
                  const Icon = badge.icon;
                  return (
                    <tr
                      key={d.id}
                      className="border-t border-[#1A1D27] hover:bg-[#151820] transition-colors"
                    >
                      <td className="px-5 py-3.5 text-sm text-[#A0A8B8] font-mono">
                        #{d.id}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-1 text-xs text-[#A0A8B8]">
                          {d.disputeType === DisputeType.COMPANY ? (
                            <Building2 size={12} />
                          ) : (
                            <User size={12} />
                          )}
                          {d.disputeType === DisputeType.COMPANY
                            ? "Company"
                            : "Citizen"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-[#A0A8B8] font-mono">
                        #{String(d.tenderId)}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[#A0A8B8] font-mono">
                        {truncateAddr(d.complainant)}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[#A0A8B8] font-mono">
                        {truncateAddr(d.accused)}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[#A0A8B8] max-w-[200px] truncate">
                        {d.reason}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[#6B7280]">
                        {new Date(Number(d.filedAt) * 1000).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5">
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

      {/* File Complaint Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-heading font-semibold text-[#F0F2F5]">
                File Complaint
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-[#6B7280] hover:text-[#F0F2F5] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {isSuccess ? (
              <div className="text-center space-y-3 py-4">
                <CheckCircle size={32} className="text-[#00E87B] mx-auto" />
                <p className="text-sm text-[#F0F2F5]">Complaint filed successfully</p>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setTenderId("");
                    setAccused("");
                    setReason("");
                  }}
                  className="text-sm text-[#00E87B]"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                {/* Type */}
                <div>
                  <label className="block text-xs text-[#6B7280] mb-1.5 uppercase tracking-wider">
                    Complaint Type
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setComplaintType("citizen")}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        complaintType === "citizen"
                          ? "bg-[#00E87B]/10 text-[#00E87B] border-[#00E87B]/20"
                          : "bg-[#0C0D14] text-[#A0A8B8] border-[#1A1D27]"
                      }`}
                    >
                      <User size={14} />
                      Citizen (Free)
                    </button>
                    <button
                      onClick={() => setComplaintType("company")}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        complaintType === "company"
                          ? "bg-[#4A9FFF]/10 text-[#4A9FFF] border-[#4A9FFF]/20"
                          : "bg-[#0C0D14] text-[#A0A8B8] border-[#1A1D27]"
                      }`}
                    >
                      <Building2 size={14} />
                      Company (0.01 ETH)
                    </button>
                  </div>
                </div>

                {/* Tender ID */}
                <div>
                  <label className="block text-xs text-[#6B7280] mb-1.5 uppercase tracking-wider">
                    Tender ID
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={tenderId}
                    onChange={(e) => setTenderId(e.target.value)}
                    placeholder="e.g. 0"
                    className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1A1D27] rounded-lg text-sm text-[#F0F2F5] placeholder-[#3A3F4B] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
                  />
                </div>

                {/* Accused */}
                <div>
                  <label className="block text-xs text-[#6B7280] mb-1.5 uppercase tracking-wider">
                    Accused Address
                  </label>
                  <input
                    type="text"
                    value={accused}
                    onChange={(e) => setAccused(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1A1D27] rounded-lg text-sm text-[#F0F2F5] placeholder-[#3A3F4B] focus:outline-none focus:border-[#00E87B]/30 transition-colors font-mono"
                  />
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-xs text-[#6B7280] mb-1.5 uppercase tracking-wider">
                    Reason
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Describe the complaint..."
                    rows={3}
                    className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1A1D27] rounded-lg text-sm text-[#F0F2F5] placeholder-[#3A3F4B] focus:outline-none focus:border-[#00E87B]/30 transition-colors resize-none"
                  />
                </div>

                {writeError && (
                  <p className="text-xs text-[#FF4444]">
                    {writeError.message.slice(0, 150)}
                  </p>
                )}

                <button
                  onClick={handleFileComplaint}
                  disabled={isWriting || isConfirming || !tenderId || !accused || !reason}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FF4444] text-white rounded-lg font-semibold text-sm hover:bg-[#FF4444]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
