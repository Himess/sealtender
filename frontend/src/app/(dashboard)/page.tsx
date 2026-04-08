"use client";

import Link from "next/link";
import {
  FileText,
  Users,
  Wallet,
  AlertTriangle,
  ArrowRight,
  Plus,
  Lock,
} from "lucide-react";
import {
  useTenderCount,
  useAllTenderAddresses,
  useAllTendersData,
  useBidderRegistryCount,
  useDisputeCount,
  stateLabel,
  stateColor,
  truncateAddr,
  formatUsd,
  formatDeadline,
} from "@/hooks/useContractData";

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
  color,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  loading: boolean;
  color: string;
}) {
  return (
    <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-5 card-hover">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[#6B7280] uppercase tracking-wider">
          {label}
        </span>
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center`}
          style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
        >
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-16 bg-[#1A1D27] rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-heading font-bold text-[#F0F2F5]">
          {value}
        </p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { data: tenderCount, isLoading: loadingCount } = useTenderCount();
  const { data: bidderCount, isLoading: loadingBidders } = useBidderRegistryCount();
  const { data: disputeCount, isLoading: loadingDisputes } = useDisputeCount();
  const { data: addresses, isLoading: loadingAddresses } = useAllTenderAddresses();

  const { tenders, isLoading: loadingTenders } = useAllTendersData(
    addresses as readonly `0x${string}`[] | undefined
  );

  // Calculate total escrow from all tenders
  const totalEscrow = tenders.reduce((sum, t) => {
    return sum + (t.totalDeposits || BigInt(0));
  }, BigInt(0));

  const activeTenders = tenders.filter(
    (t) => t.state === 1 || t.state === 0
  ).length;

  const isLoading = loadingCount || loadingAddresses || loadingTenders;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#F0F2F5]">
            Dashboard
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            FHE-encrypted procurement overview
          </p>
        </div>
        <Link
          href="/tenders/create"
          className="flex items-center gap-2 px-4 py-2.5 bg-[#00E87B] text-[#08090E] rounded-lg font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
        >
          <Plus size={16} />
          New Tender
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Tenders"
          value={isLoading ? "..." : String(activeTenders)}
          icon={FileText}
          loading={loadingCount}
          color="#00E87B"
        />
        <StatCard
          label="Registered Bidders"
          value={bidderCount !== undefined ? String(bidderCount) : "0"}
          icon={Users}
          loading={loadingBidders}
          color="#4A9FFF"
        />
        <StatCard
          label="Total Bid Bonds"
          value={formatUsd(totalEscrow)}
          icon={Wallet}
          loading={isLoading}
          color="#FFB800"
        />
        <StatCard
          label="Disputes"
          value={disputeCount !== undefined ? String(disputeCount) : "0"}
          icon={AlertTriangle}
          loading={loadingDisputes}
          color="#FF4444"
        />
      </div>

      {/* Protocol Badge */}
      <div className="bg-[#0F1117] border border-[#00E87B]/10 rounded-xl p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#00E87B]/10 border border-[#00E87B]/20 flex items-center justify-center shrink-0">
          <Lock size={16} className="text-[#00E87B]" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-[#F0F2F5]">
            All bids are encrypted using Zama fhEVM (Fully Homomorphic Encryption)
          </p>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Bid amounts, delivery timelines, and qualifications remain encrypted on-chain until reveal
          </p>
        </div>
      </div>

      {/* Tenders Table */}
      <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-[#1A1D27]">
          <h2 className="text-base font-heading font-semibold text-[#F0F2F5]">
            Recent Tenders
          </h2>
          <Link
            href="/tenders"
            className="flex items-center gap-1 text-xs text-[#00E87B] hover:text-[#00E87B]/80 transition-colors"
          >
            View All
            <ArrowRight size={14} />
          </Link>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 items-center">
                <div className="h-4 w-8 bg-[#1A1D27] rounded animate-pulse" />
                <div className="h-4 flex-1 bg-[#1A1D27] rounded animate-pulse" />
                <div className="h-4 w-16 bg-[#1A1D27] rounded animate-pulse" />
                <div className="h-4 w-20 bg-[#1A1D27] rounded animate-pulse" />
                <div className="h-5 w-16 bg-[#1A1D27] rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : tenders.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={32} className="text-[#3A3F4B] mx-auto mb-3" />
            <p className="text-sm text-[#6B7280]">No tenders created yet</p>
            <Link
              href="/tenders/create"
              className="inline-flex items-center gap-2 mt-3 text-sm text-[#00E87B] hover:text-[#00E87B]/80"
            >
              <Plus size={14} />
              Create First Tender
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-[#6B7280] uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium">ID</th>
                  <th className="text-left px-5 py-3 font-medium">
                    Description
                  </th>
                  <th className="text-left px-5 py-3 font-medium">Bidders</th>
                  <th className="text-left px-5 py-3 font-medium">Escrow</th>
                  <th className="text-left px-5 py-3 font-medium">
                    Deadline
                  </th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-right px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {tenders.slice(0, 10).map((tender) => (
                  <tr
                    key={tender.address}
                    className="border-t border-[#1A1D27] hover:bg-[#151820] transition-colors"
                  >
                    <td className="px-5 py-3.5 text-sm text-[#A0A8B8] font-mono">
                      #{tender.index}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[#F0F2F5] max-w-[250px] truncate">
                      {tender.config?.description || "Unnamed Tender"}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[#A0A8B8]">
                      {tender.bidderCount !== undefined
                        ? String(tender.bidderCount)
                        : "0"}
                      /{tender.config?.maxBidders || "--"}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[#A0A8B8] font-mono">
                      {formatUsd(tender.totalDeposits)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[#A0A8B8]">
                      {formatDeadline(tender.config?.deadline)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${stateColor(
                          tender.state
                        )}`}
                      >
                        {stateLabel(tender.state)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/tenders/${tender.index}`}
                        className="text-xs text-[#00E87B] hover:text-[#00E87B]/80 transition-colors"
                      >
                        View &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
