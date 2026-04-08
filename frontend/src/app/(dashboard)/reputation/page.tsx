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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#F0F2F5]">
          Reputation Board
        </h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Bidder reputation scores and rankings
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-[#6B7280] mb-2">
            <Users size={14} />
            Registered Bidders
          </div>
          {isLoading ? (
            <div className="h-7 w-8 bg-[#1A1D27] rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-heading font-bold text-[#F0F2F5]">
              {count}
            </p>
          )}
        </div>
        <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-[#6B7280] mb-2">
            <Star size={14} />
            Active Bidders
          </div>
          {isLoading ? (
            <div className="h-7 w-8 bg-[#1A1D27] rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-heading font-bold text-[#00E87B]">
              {activeBidders}
            </p>
          )}
        </div>
        <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-[#6B7280] mb-2">
            <TrendingUp size={14} />
            Average Score
          </div>
          {isLoading ? (
            <div className="h-7 w-12 bg-[#1A1D27] rounded animate-pulse" />
          ) : (
            <p className={`text-2xl font-heading font-bold ${scoreColor(avgScore)}`}>
              {avgScore}
            </p>
          )}
        </div>
        <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-[#6B7280] mb-2">
            <Award size={14} />
            Top Score
          </div>
          {isLoading ? (
            <div className="h-7 w-12 bg-[#1A1D27] rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-heading font-bold text-[#A855F7]">
              {topScore}
            </p>
          )}
        </div>
      </div>

      {/* Ranking Table */}
      <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1A1D27]">
          <h2 className="text-base font-heading font-semibold text-[#F0F2F5]">
            Bidder Rankings
          </h2>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 items-center">
                <div className="h-4 w-6 bg-[#1A1D27] rounded animate-pulse" />
                <div className="h-4 w-24 bg-[#1A1D27] rounded animate-pulse" />
                <div className="h-4 flex-1 bg-[#1A1D27] rounded animate-pulse" />
                <div className="h-4 w-16 bg-[#1A1D27] rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : bidders.length === 0 ? (
          <div className="p-12 text-center">
            <Star size={32} className="text-[#3A3F4B] mx-auto mb-3" />
            <p className="text-sm text-[#6B7280]">
              No registered bidders yet
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-[#6B7280] uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium w-12">
                    Rank
                  </th>
                  <th className="text-left px-5 py-3 font-medium">Name</th>
                  <th className="text-left px-5 py-3 font-medium">Address</th>
                  <th className="text-left px-5 py-3 font-medium">Reg. ID</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium w-48">
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
                      className="border-t border-[#1A1D27] hover:bg-[#151820] transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <span
                          className={`text-sm font-bold ${
                            idx === 0
                              ? "text-[#FFB800]"
                              : idx === 1
                              ? "text-[#A0A8B8]"
                              : idx === 2
                              ? "text-[#CD7F32]"
                              : "text-[#6B7280]"
                          }`}
                        >
                          #{idx + 1}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-[#F0F2F5] font-medium">
                        {bidder.name || "Anonymous"}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[#A0A8B8] font-mono">
                        {truncateAddr(bidder.address)}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[#A0A8B8]">
                        {bidder.registrationId || "--"}
                      </td>
                      <td className="px-5 py-3.5">
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
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-[#1A1D27] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${scoreBarColor(
                                score
                              )}`}
                              style={{ width: `${Math.min(score, 100)}%` }}
                            />
                          </div>
                          <span
                            className={`text-sm font-bold min-w-[2rem] text-right ${scoreColor(
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
