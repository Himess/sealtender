"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  FileText,
  Users,
  Clock,
  Lock,
  Filter,
} from "lucide-react";
import {
  useAllTenderAddresses,
  useAllTendersData,
  stateLabel,
  stateColor,
  stateFilterKey,
  formatDeadline,
  formatUsd,
  truncateAddr,
  TenderData,
} from "@/hooks/useContractData";
import { TenderState } from "@/lib/contracts";

const filterTabs = [
  { key: "all", label: "All" },
  { key: "bidding", label: "Bidding" },
  { key: "created", label: "Created" },
  { key: "closed", label: "Closed" },
  { key: "evaluating", label: "Evaluating" },
  { key: "revealed", label: "Revealed" },
  { key: "cancelled", label: "Cancelled" },
];

function TenderCard({ tender }: { tender: TenderData }) {
  return (
    <Link
      href={`/tenders/${tender.index}`}
      className="block bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 card-hover glow-encrypted transition-all hover:translate-y-[-1px]"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="font-body text-[12px] text-[#666666] font-mono">
          Tender #{tender.index}
        </span>
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${stateColor(
            tender.state
          )}`}
        >
          {stateLabel(tender.state)}
        </span>
      </div>

      <h3 className="font-body text-[14px] font-medium text-[#F0F0F0] mb-4 line-clamp-2">
        {tender.config?.description || "Unnamed Tender"}
      </h3>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-[#666666]">
            <Users size={12} />
            Bidders
          </span>
          <span className="text-[#888888]">
            {tender.bidderCount !== undefined
              ? String(tender.bidderCount)
              : "0"}
            /{tender.config?.maxBidders || "--"}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-[#666666]">
            <Clock size={12} />
            Deadline
          </span>
          <span className="text-[#888888]">
            {formatDeadline(tender.config?.deadline)}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-[#666666]">
            <Lock size={12} />
            Escrow
          </span>
          <span className="text-[#888888] font-mono">
            {formatUsd(tender.totalDeposits)}
          </span>
        </div>
      </div>

      {tender.state === TenderState.REVEALED && tender.winner && (
        <div className="mt-3 pt-3 border-t border-[#1E2230]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#A855F7]">Winner</span>
            <span className="text-[#F0F0F0] font-mono">
              {truncateAddr(tender.winner)}
            </span>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-[#1E2230]">
        <span className="text-[10px] text-[#555555] font-mono">
          {truncateAddr(tender.address)}
        </span>
      </div>
    </Link>
  );
}

export default function TendersPage() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const { data: addresses, isLoading: loadingAddresses } =
    useAllTenderAddresses();
  const { tenders, isLoading: loadingTenders } = useAllTendersData(
    addresses as readonly `0x${string}`[] | undefined
  );

  const isLoading = loadingAddresses || loadingTenders;

  // Filter counts
  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tenders.length };
    for (const tender of tenders) {
      const key = stateFilterKey(tender.state);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [tenders]);

  // Apply filters
  const filteredTenders = useMemo(() => {
    let result = tenders;

    if (activeFilter !== "all") {
      result = result.filter(
        (t) => stateFilterKey(t.state) === activeFilter
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) =>
        t.config?.description?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [tenders, activeFilter, search]);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
            Tenders
          </h1>
          <p className="font-body text-[14px] text-[#666666] mt-1">
            Browse all procurement tenders
          </p>
        </div>
        <Link
          href="/tenders/create"
          className="flex items-center gap-2 px-5 py-[10px] bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
        >
          <Plus size={16} />
          New Tender
        </Link>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666666]"
          />
          <input
            type="text"
            placeholder="Search tenders by description..."
            aria-label="Search tenders"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Filter size={14} className="text-[#666666] shrink-0" />
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors whitespace-nowrap ${
                activeFilter === tab.key
                  ? "bg-[#00E87B]/10 text-[#00E87B] border border-[#00E87B]/20"
                  : "text-[#888888] hover:text-[#F0F0F0] hover:bg-[#151820] border border-transparent"
              }`}
            >
              {tab.label}
              {filterCounts[tab.key] !== undefined && (
                <span className="text-[10px] opacity-60">
                  ({filterCounts[tab.key]})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-3"
            >
              <div className="flex justify-between">
                <div className="h-3 w-16 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-5 w-16 bg-[#1E2230] rounded-full animate-pulse" />
              </div>
              <div className="h-4 w-full bg-[#1E2230] rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-[#1E2230] rounded animate-pulse" />
              <div className="space-y-2 pt-2">
                <div className="h-3 w-full bg-[#1E2230] rounded animate-pulse" />
                <div className="h-3 w-full bg-[#1E2230] rounded animate-pulse" />
                <div className="h-3 w-full bg-[#1E2230] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredTenders.length === 0 ? (
        <div className="text-center py-16">
          <FileText size={40} className="text-[#555555] mx-auto mb-3" />
          <p className="font-body text-[14px] text-[#666666]">
            {search || activeFilter !== "all"
              ? "No tenders match your filters"
              : "No tenders created yet"}
          </p>
          {!search && activeFilter === "all" && (
            <Link
              href="/tenders/create"
              className="inline-flex items-center gap-2 mt-3 font-body text-[14px] text-[#00E87B] hover:text-[#00E87B]/80"
            >
              <Plus size={14} />
              Create First Tender
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTenders.map((tender) => (
            <TenderCard key={tender.address} tender={tender} />
          ))}
        </div>
      )}
    </div>
  );
}
