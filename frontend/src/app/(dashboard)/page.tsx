"use client";

import Link from "next/link";
import {
  FileText,
  Lock,
  Database,
  Shield,
  ArrowRight,
  Plus,
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
  sub,
  icon: Icon,
  loading,
  iconColor,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  loading: boolean;
  iconColor: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon size={20} style={{ color: iconColor }} />
        <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
          {label}
        </span>
      </div>
      {loading ? (
        <div className="h-10 w-16 bg-[#1E2230] rounded animate-pulse" />
      ) : (
        <div>
          <p
            className="font-heading text-[36px] font-bold"
            style={{ color: valueColor || "#F0F0F0" }}
          >
            {value}
          </p>
          {sub && (
            <p className="font-body text-[12px] text-[#00E87B] mt-1">{sub}</p>
          )}
        </div>
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

  const encryptedBids = tenders.reduce((sum, t) => {
    return sum + (t.bidderCount ? Number(t.bidderCount) : 0);
  }, 0);

  const isLoading = loadingCount || loadingAddresses || loadingTenders;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
            Dashboard
          </h1>
          <p className="font-body text-[14px] text-[#666666] mt-1">
            Overview of all procurement activities
          </p>
        </div>
        <Link
          href="/tenders/create"
          className="flex items-center gap-2 px-5 py-[10px] bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
        >
          <Plus size={16} />
          Create Tender
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="ACTIVE TENDERS"
          value={isLoading ? "..." : String(activeTenders)}
          sub={isLoading ? undefined : `${tenders.length} total`}
          icon={FileText}
          loading={loadingCount}
          iconColor="#00E87B"
        />
        <StatCard
          label="ENCRYPTED BIDS"
          value={isLoading ? "..." : String(encryptedBids)}
          icon={Lock}
          loading={isLoading}
          iconColor="#00E87B"
        />
        <StatCard
          label="TOTAL BID BONDS"
          value={formatUsd(totalEscrow)}
          icon={Database}
          loading={isLoading}
          iconColor="#888888"
        />
        <StatCard
          label="DISPUTES"
          value={disputeCount !== undefined ? String(disputeCount) : "0"}
          icon={Shield}
          loading={loadingDisputes}
          iconColor="#FFB800"
          valueColor="#FFB800"
        />
      </div>

      {/* Tenders Table */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-[14px] border-b border-[#1E2230]">
          <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
            Recent Tenders
          </h2>
          <Link
            href="/tenders/create"
            className="flex items-center gap-2 px-4 py-[10px] bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
          >
            <Plus size={14} />
            Create Tender
          </Link>
        </div>

        {isLoading ? (
          <div aria-busy="true" aria-label="Loading tenders" className="p-5 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 items-center">
                <div className="h-4 w-8 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-4 flex-1 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-4 w-16 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-4 w-20 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-5 w-16 bg-[#1E2230] rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : tenders.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={32} className="text-[#555555] mx-auto mb-3" />
            <p className="font-body text-[14px] text-[#666666]">No tenders created yet</p>
            <Link
              href="/tenders/create"
              className="inline-flex items-center gap-2 mt-3 font-body text-[14px] text-[#00E87B] hover:text-[#00E87B]/80"
            >
              <Plus size={14} />
              Create First Tender
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1E2230]">
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">ID</th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
                    Description
                  </th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Bidders</th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Escrow</th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
                    Deadline
                  </th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Status</th>
                  <th scope="col" className="text-right px-5 py-[14px]"></th>
                </tr>
              </thead>
              <tbody>
                {tenders.slice(0, 10).map((tender) => (
                  <tr
                    key={tender.address}
                    className="border-b border-[#1E2230] hover:bg-[#151820] transition-colors"
                  >
                    <td className="px-5 py-[14px] font-body text-[14px] text-[#888888] font-mono">
                      #{tender.index}
                    </td>
                    <td className="px-5 py-[14px] font-body text-[14px] text-[#F0F0F0] max-w-[250px] truncate">
                      {tender.config?.description || "Unnamed Tender"}
                    </td>
                    <td className="px-5 py-[14px] font-body text-[14px] text-[#888888]">
                      {tender.bidderCount !== undefined
                        ? String(tender.bidderCount)
                        : "0"}
                      /{tender.config?.maxBidders || "--"}
                    </td>
                    <td className="px-5 py-[14px] font-body text-[14px] text-[#888888] font-mono">
                      {formatUsd(tender.totalDeposits)}
                    </td>
                    <td className="px-5 py-[14px] font-body text-[14px] text-[#888888]">
                      {formatDeadline(tender.config?.deadline)}
                    </td>
                    <td className="px-5 py-[14px]">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${stateColor(
                          tender.state
                        )}`}
                      >
                        {stateLabel(tender.state)}
                      </span>
                    </td>
                    <td className="px-5 py-[14px] text-right">
                      <Link
                        href={`/tenders/${tender.index}`}
                        className="font-body text-[12px] text-[#00E87B] hover:text-[#00E87B]/80 transition-colors"
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
