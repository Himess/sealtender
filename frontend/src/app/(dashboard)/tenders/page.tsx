"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  FileText,
  Users,
  Clock,
  Filter,
  MapPin,
  Wallet,
} from "lucide-react";
import {
  useAllTenderAddresses,
  useAllTendersData,
  stateLabel,
  stateColor,
  stateFilterKey,
  formatDeadline,
  formatUsd6,
  formatTenderRef,
  categoryLabel,
  categoryBadgeColor,
  truncateAddr,
  TenderData,
} from "@/hooks/useContractData";
import { TenderState } from "@/lib/contracts";

const filterTabs = [
  { key: "all", label: "All" },
  { key: "bidding", label: "Open for Bids" },
  { key: "created", label: "Draft" },
  { key: "closed", label: "Closed" },
  { key: "evaluating", label: "Under Evaluation" },
  { key: "revealed", label: "Awarded" },
  { key: "cancelled", label: "Cancelled" },
];

function TenderCard({ tender }: { tender: TenderData }) {
  const ref = formatTenderRef(tender.index, tender.config?.deadline);
  const category = tender.spec?.category;
  const hasValue =
    tender.spec &&
    (tender.spec.estimatedValueMin > 0n || tender.spec.estimatedValueMax > 0n);

  return (
    <Link
      href={`/tenders/${tender.index}`}
      className="group block bg-[#0D0F14] border border-[#1E2230] rounded-lg overflow-hidden card-hover glow-encrypted transition-all hover:translate-y-[-1px] hover:border-[#00E87B]/30"
    >
      {/* Top strip: ref + status */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#1E2230] bg-[#0A0C11]">
        <span className="font-body text-[11px] text-[#888888] font-mono tracking-[0.5px]">
          {ref}
        </span>
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-[0.5px] ${stateColor(
            tender.state
          )}`}
        >
          {stateLabel(tender.state)}
        </span>
      </div>

      <div className="px-5 py-5 space-y-4">
        {/* Category badge */}
        {category && (
          <span
            className={`inline-flex px-2 py-0.5 rounded-[4px] text-[10px] font-semibold border uppercase tracking-[0.5px] ${categoryBadgeColor(
              category
            )}`}
          >
            {categoryLabel(category)}
          </span>
        )}

        {/* Title */}
        <h3 className="font-heading text-[15px] font-semibold text-[#F0F0F0] leading-[1.35] line-clamp-2 min-h-[42px] group-hover:text-[#00E87B] transition-colors">
          {tender.config?.description || "Untitled Tender"}
        </h3>

        {/* Authority */}
        <div className="flex items-center gap-1.5 text-[11px] text-[#666666]">
          <MapPin size={11} />
          <span className="font-body">Authority</span>
          <span className="text-[#888888] font-mono">
            {truncateAddr(tender.creator)}
          </span>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#1E2230]" />

        {/* Estimated Value */}
        <div>
          <p className="font-heading text-[9px] font-semibold tracking-[1px] uppercase text-[#666666] mb-1">
            Estimated Value
          </p>
          <p className="font-body text-[13px] text-[#F0F0F0] font-semibold">
            {hasValue ? (
              <>
                {formatUsd6(tender.spec!.estimatedValueMin)}
                <span className="text-[#666666] font-normal">
                  {" "}
                  &ndash;{" "}
                </span>
                {formatUsd6(tender.spec!.estimatedValueMax)}
              </>
            ) : (
              <span className="text-[#666666] font-normal italic">
                Not disclosed
              </span>
            )}
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-[#1A1F2B] flex items-center justify-center shrink-0">
              <Users size={12} className="text-[#888888]" />
            </div>
            <div>
              <p className="font-heading text-[9px] font-semibold tracking-[0.5px] uppercase text-[#666666]">
                Bidders
              </p>
              <p className="font-body text-[12px] text-[#F0F0F0] font-medium">
                {tender.bidderCount !== undefined
                  ? String(tender.bidderCount)
                  : "0"}
                <span className="text-[#666666] font-normal">
                  /
                  {tender.config?.maxBidders !== undefined
                    ? String(tender.config.maxBidders)
                    : "--"}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-[#1A1F2B] flex items-center justify-center shrink-0">
              <Clock size={12} className="text-[#888888]" />
            </div>
            <div>
              <p className="font-heading text-[9px] font-semibold tracking-[0.5px] uppercase text-[#666666]">
                Deadline
              </p>
              <p className="font-body text-[12px] text-[#F0F0F0] font-medium">
                {formatDeadline(tender.config?.deadline)}
              </p>
            </div>
          </div>
        </div>

        {/* Award footer */}
        {tender.state === TenderState.Revealed && tender.winner && (
          <div className="pt-3 mt-1 border-t border-[#1E2230] flex items-center justify-between">
            <span className="font-heading text-[9px] font-semibold tracking-[1px] uppercase text-[#A855F7]">
              Awarded
            </span>
            <div className="flex items-center gap-1.5">
              <Wallet size={11} className="text-[#A855F7]" />
              <span className="font-body text-[11px] text-[#F0F0F0] font-mono">
                {truncateAddr(tender.winner)}
              </span>
            </div>
          </div>
        )}
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
      result = result.filter((t) => stateFilterKey(t.state) === activeFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.config?.description?.toLowerCase().includes(q) ||
          t.spec?.category?.toLowerCase().includes(q) ||
          formatTenderRef(t.index, t.config?.deadline)
            .toLowerCase()
            .includes(q)
      );
    }

    return result;
  }, [tenders, activeFilter, search]);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
            Public Tender Register
          </h1>
          <p className="font-body text-[14px] text-[#666666] mt-1">
            Official record of all procurement tenders issued via SealTender
            Protocol
          </p>
        </div>
        <Link
          href="/tenders/create"
          className="flex items-center gap-2 px-5 py-[10px] bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
        >
          <Plus size={16} />
          Issue New Tender
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
            placeholder="Search by tender reference, description, or category..."
            aria-label="Search tenders"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
          />
        </div>

        <div
          role="tablist"
          aria-label="Filter tenders by status"
          className="flex items-center gap-2 overflow-x-auto pb-1"
        >
          <Filter
            size={14}
            className="text-[#666666] shrink-0"
            aria-hidden="true"
          />
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeFilter === tab.key}
              aria-label={`Filter by ${tab.label}`}
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
              className="bg-[#0D0F14] border border-[#1E2230] rounded-lg overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-[#1E2230] bg-[#0A0C11] flex justify-between">
                <div className="h-3 w-20 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-4 w-16 bg-[#1E2230] rounded-full animate-pulse" />
              </div>
              <div className="px-5 py-5 space-y-4">
                <div className="h-4 w-20 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-4 w-full bg-[#1E2230] rounded animate-pulse" />
                <div className="h-4 w-3/4 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-px bg-[#1E2230]" />
                <div className="h-10 w-full bg-[#1E2230] rounded animate-pulse" />
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
              : "No tenders have been issued yet"}
          </p>
          {!search && activeFilter === "all" && (
            <Link
              href="/tenders/create"
              className="inline-flex items-center gap-2 mt-3 font-body text-[14px] text-[#00E87B] hover:text-[#00E87B]/80"
            >
              <Plus size={14} />
              Issue First Tender
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
