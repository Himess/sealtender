"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { parseAbi } from "viem";
import { Star, Award, Users, TrendingUp } from "lucide-react";
import {
  useBidderRegistryCount,
  truncateAddr,
} from "@/hooks/useContractData";
import { ADDRESSES, BidderRegistryABI } from "@/lib/contracts";

const registryAbi = parseAbi(BidderRegistryABI);

interface BidderData {
  address: `0x${string}`;
  name: string;
  registrationId: string;
  registeredAt: bigint;
  active: boolean;
  score: bigint;
}

export default function ReputationPage() {
  const { data: bidderCount, isLoading: loadingCount } =
    useBidderRegistryCount();
  const count = bidderCount ? Number(bidderCount) : 0;

  // Batch read all bidder addresses
  const addressContracts = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      address: ADDRESSES.BidderRegistry,
      abi: registryAbi,
      functionName: "allBidders" as const,
      args: [BigInt(i)] as const,
    }));
  }, [count]);

  const { data: addressResults, isLoading: loadingAddresses } =
    useReadContracts({
      contracts: addressContracts,
      query: { enabled: count > 0 },
    });

  const bidderAddresses = useMemo(() => {
    if (!addressResults) return [];
    return addressResults
      .filter((r) => r.status === "success")
      .map((r) => r.result as `0x${string}`);
  }, [addressResults]);

  // Batch read profiles and scores
  const profileContracts = useMemo(() => {
    return bidderAddresses.flatMap((addr) => [
      {
        address: ADDRESSES.BidderRegistry,
        abi: registryAbi,
        functionName: "getProfile" as const,
        args: [addr] as const,
      },
      {
        address: ADDRESSES.BidderRegistry,
        abi: registryAbi,
        functionName: "getReputationScore" as const,
        args: [addr] as const,
      },
    ]);
  }, [bidderAddresses]);

  const { data: profileResults, isLoading: loadingProfiles } =
    useReadContracts({
      contracts: profileContracts,
      query: { enabled: bidderAddresses.length > 0 },
    });

  // Parse into bidder data
  const bidders: BidderData[] = useMemo(() => {
    if (!profileResults || !bidderAddresses.length) return [];
    const result: BidderData[] = [];

    for (let i = 0; i < bidderAddresses.length; i++) {
      const profileIdx = i * 2;
      const scoreIdx = i * 2 + 1;

      const profileResult = profileResults[profileIdx];
      const scoreResult = profileResults[scoreIdx];

      if (profileResult?.status === "success" && Array.isArray(profileResult.result)) {
        const [name, registrationId, registeredAt, active] =
          profileResult.result as [string, string, bigint, boolean];
        const score =
          scoreResult?.status === "success"
            ? (scoreResult.result as bigint)
            : BigInt(0);

        result.push({
          address: bidderAddresses[i],
          name,
          registrationId,
          registeredAt,
          active,
          score,
        });
      }
    }

    // Sort by score descending
    return result.sort((a, b) => Number(b.score) - Number(a.score));
  }, [profileResults, bidderAddresses]);

  const isLoading = loadingCount || loadingAddresses || loadingProfiles;

  function scoreColor(score: number): string {
    if (score >= 80) return "text-[#00E87B]";
    if (score >= 60) return "text-[#4A9FFF]";
    if (score >= 40) return "text-[#FFB800]";
    return "text-[#FF4444]";
  }

  function scoreBarColor(score: number): string {
    if (score >= 80) return "bg-[#00E87B]";
    if (score >= 60) return "bg-[#4A9FFF]";
    if (score >= 40) return "bg-[#FFB800]";
    return "bg-[#FF4444]";
  }

  // Stats
  const avgScore =
    bidders.length > 0
      ? Math.round(
          bidders.reduce((s, b) => s + Number(b.score), 0) / bidders.length
        )
      : 0;
  const activeBidders = bidders.filter((b) => b.active).length;
  const topScore =
    bidders.length > 0 ? Number(bidders[0]?.score || 0) : 0;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
          Reputation Board
        </h1>
        <p className="font-body text-[14px] text-[#666666] mt-1">
          Bidder reputation scores and rankings
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6">
          <div className="flex items-center gap-2 mb-3">
            <Users size={14} className="text-[#666666]" />
            <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
              Registered Bidders
            </span>
          </div>
          {isLoading ? (
            <div className="h-10 w-8 bg-[#1E2230] rounded animate-pulse" />
          ) : (
            <p className="font-heading text-[36px] font-bold text-[#F0F0F0]">
              {count}
            </p>
          )}
        </div>
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6">
          <div className="flex items-center gap-2 mb-3">
            <Star size={14} className="text-[#666666]" />
            <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
              Active Bidders
            </span>
          </div>
          {isLoading ? (
            <div className="h-10 w-8 bg-[#1E2230] rounded animate-pulse" />
          ) : (
            <p className="font-heading text-[36px] font-bold text-[#00E87B]">
              {activeBidders}
            </p>
          )}
        </div>
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-[#666666]" />
            <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
              Average Score
            </span>
          </div>
          {isLoading ? (
            <div className="h-10 w-12 bg-[#1E2230] rounded animate-pulse" />
          ) : (
            <p className={`font-heading text-[36px] font-bold ${scoreColor(avgScore)}`}>
              {avgScore}
            </p>
          )}
        </div>
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6">
          <div className="flex items-center gap-2 mb-3">
            <Award size={14} className="text-[#666666]" />
            <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
              Top Score
            </span>
          </div>
          {isLoading ? (
            <div className="h-10 w-12 bg-[#1E2230] rounded animate-pulse" />
          ) : (
            <p className="font-heading text-[36px] font-bold text-[#A855F7]">
              {topScore}
            </p>
          )}
        </div>
      </div>

      {/* Ranking Table */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg overflow-hidden">
        <div className="px-5 py-[14px] border-b border-[#1E2230]">
          <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
            Bidder Rankings
          </h2>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 items-center">
                <div className="h-4 w-6 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-4 w-24 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-4 flex-1 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-4 w-16 bg-[#1E2230] rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : bidders.length === 0 ? (
          <div className="p-12 text-center">
            <Star size={32} className="text-[#555555] mx-auto mb-3" />
            <p className="font-body text-[14px] text-[#666666]">
              No registered bidders yet
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1E2230]">
                  <th className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase w-12">
                    Rank
                  </th>
                  <th className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Name</th>
                  <th className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Address</th>
                  <th className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Reg. ID</th>
                  <th className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Status</th>
                  <th className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase w-48">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {bidders.map((bidder, idx) => {
                  const score = Number(bidder.score);
                  return (
                    <tr
                      key={bidder.address}
                      className="border-b border-[#1E2230] hover:bg-[#151820] transition-colors"
                    >
                      <td className="px-5 py-[14px]">
                        <span
                          className={`font-body text-[14px] font-bold ${
                            idx === 0
                              ? "text-[#FFB800]"
                              : idx === 1
                              ? "text-[#888888]"
                              : idx === 2
                              ? "text-[#CD7F32]"
                              : "text-[#666666]"
                          }`}
                        >
                          #{idx + 1}
                        </span>
                      </td>
                      <td className="px-5 py-[14px] font-body text-[14px] text-[#F0F0F0] font-medium">
                        {bidder.name || "Anonymous"}
                      </td>
                      <td className="px-5 py-[14px] font-body text-[12px] text-[#888888] font-mono">
                        {truncateAddr(bidder.address)}
                      </td>
                      <td className="px-5 py-[14px] font-body text-[12px] text-[#888888]">
                        {bidder.registrationId || "--"}
                      </td>
                      <td className="px-5 py-[14px]">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                            bidder.active
                              ? "text-[#00E87B] bg-[#00E87B]/10 border-[#00E87B]/20"
                              : "text-[#FF4444] bg-[#FF4444]/10 border-[#FF4444]/20"
                          }`}
                        >
                          {bidder.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-[14px]">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-[#1E2230] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${scoreBarColor(
                                score
                              )}`}
                              style={{ width: `${Math.min(score, 100)}%` }}
                            />
                          </div>
                          <span
                            className={`font-body text-[14px] font-bold min-w-[2rem] text-right ${scoreColor(
                              score
                            )}`}
                          >
                            {score}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
