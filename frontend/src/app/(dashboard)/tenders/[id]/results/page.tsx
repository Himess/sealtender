"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { useReadContracts } from "wagmi";
import { parseAbi } from "viem";
import {
  ArrowLeft,
  Trophy,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  useTenderAddress,
  useTenderConfig,
  useTenderState,
  useBidderCount,
  useTenderWinner,
  useRevealedPrice,
  stateLabel,
  truncateAddr,
  formatUsd,
  parseConfig,
} from "@/hooks/useContractData";
import { EncryptedTenderABI, TenderState } from "@/lib/contracts";

const tenderAbi = parseAbi(EncryptedTenderABI);

export default function EvaluationResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const tenderId = BigInt(id);

  const { data: tenderAddress, isLoading: loadingAddr } =
    useTenderAddress(tenderId);
  const addr = tenderAddress as `0x${string}` | undefined;

  const { data: configData, isLoading: loadingConfig } = useTenderConfig(addr);
  const { data: state, isLoading: loadingState } = useTenderState(addr);
  const { data: bidders, isLoading: loadingBidders } = useBidderCount(addr);
  const { data: winnerAddr } = useTenderWinner(addr);
  const { data: price } = useRevealedPrice(addr);

  const currentState = state !== undefined ? Number(state) : undefined;

  // Parse config tuple
  const config = configData ? parseConfig(configData) : null;

  const bidderCount = bidders !== undefined ? Number(bidders) : 0;

  // Fetch all bidder addresses
  const bidderContracts = useMemo(() => {
    if (!addr || bidderCount === 0) return [];
    return Array.from({ length: bidderCount }, (_, i) => ({
      address: addr,
      abi: tenderAbi,
      functionName: "getAllBidders" as const,
    }));
  }, [addr, bidderCount]);

  // We use getAllBidders to get the full list
  const { data: allBiddersResult } = useReadContracts({
    contracts: addr
      ? [
          {
            address: addr,
            abi: tenderAbi,
            functionName: "getAllBidders" as const,
          },
        ]
      : [],
    query: { enabled: !!addr && bidderCount > 0 },
  });

  const bidderAddresses = useMemo(() => {
    if (!allBiddersResult || allBiddersResult.length === 0) return [];
    const r = allBiddersResult[0];
    if (r.status === "success" && Array.isArray(r.result)) {
      return r.result as `0x${string}`[];
    }
    return [];
  }, [allBiddersResult]);

  // Fetch deposits for each bidder
  const depositContracts = useMemo(() => {
    if (!addr || bidderAddresses.length === 0) return [];
    return bidderAddresses.map((bidder) => ({
      address: addr,
      abi: tenderAbi,
      functionName: "getBidDeposit" as const,
      args: [bidder] as const,
    }));
  }, [addr, bidderAddresses]);

  const { data: depositResults } = useReadContracts({
    contracts: depositContracts,
    query: { enabled: depositContracts.length > 0 },
  });

  const isLoading = loadingAddr || loadingConfig || loadingState || loadingBidders;

  const winner =
    winnerAddr && winnerAddr !== "0x0000000000000000000000000000000000000000"
      ? (winnerAddr as string)
      : null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1E2230] rounded-lg animate-pulse" />
          <div className="h-7 w-48 bg-[#1E2230] rounded animate-pulse" />
        </div>
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-8 space-y-4">
          <div className="h-6 w-64 bg-[#1E2230] rounded animate-pulse" />
          <div className="h-4 w-full bg-[#1E2230] rounded animate-pulse" />
          <div className="h-32 w-full bg-[#1E2230] rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/tenders/${id}`}
          aria-label="Back to tender details"
          className="w-8 h-8 rounded-lg bg-[#0D0F14] border border-[#1E2230] flex items-center justify-center text-[#888888] hover:text-[#F0F0F0] hover:border-[#00E87B]/30 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
            Evaluation Results
          </h1>
          <p className="font-body text-[14px] text-[#666666] mt-1">
            Tender #{id} &mdash; {config?.description || "Unnamed Tender"}
          </p>
        </div>
      </div>

      {/* State info */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
              TENDER STATUS
            </span>
            <p className="font-heading text-[20px] font-bold text-[#F0F0F0] mt-1">
              {stateLabel(currentState)}
            </p>
          </div>
          <div className="text-right">
            <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
              TOTAL BIDDERS
            </span>
            <p className="font-heading text-[20px] font-bold text-[#F0F0F0] mt-1">
              {bidderCount}
            </p>
          </div>
        </div>
      </div>

      {/* Winner Announcement */}
      {winner && currentState !== undefined && currentState >= TenderState.REVEALED && (
        <div className="bg-[#00E87B]/5 border border-[#00E87B]/30 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Trophy size={24} className="text-[#00E87B]" />
            <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
              Winner Announced
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
                WINNER ADDRESS
              </span>
              <p className="font-body text-[14px] text-[#F0F0F0] font-mono mt-1">
                {winner}
              </p>
            </div>
            <div>
              <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
                WINNING PRICE
              </span>
              <p className="font-heading text-[20px] font-bold text-[#00E87B] mt-1">
                {formatUsd(price as bigint | undefined)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* All Bidders Table */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg overflow-hidden">
        <div className="px-5 py-[14px] border-b border-[#1E2230]">
          <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
            All Bidders
          </h2>
        </div>

        {bidderAddresses.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-body text-[14px] text-[#666666]">
              No bidders found for this tender
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1E2230]">
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase w-12">
                    #
                  </th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
                    Bidder
                  </th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
                    Price
                  </th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
                    Qualification
                  </th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody>
                {bidderAddresses.map((bidder, idx) => {
                  const isWinner =
                    winner && bidder.toLowerCase() === winner.toLowerCase();
                  const deposit =
                    depositResults?.[idx]?.status === "success"
                      ? (depositResults[idx].result as bigint)
                      : undefined;
                  const hasDeposit = deposit !== undefined && deposit > BigInt(0);

                  return (
                    <tr
                      key={bidder}
                      className={`border-b border-[#1E2230] transition-colors ${
                        isWinner
                          ? "bg-[#00E87B]/5"
                          : "hover:bg-[#151820]"
                      }`}
                    >
                      <td className="px-5 py-[14px] font-body text-[14px] text-[#888888]">
                        {idx + 1}
                      </td>
                      <td className="px-5 py-[14px] font-body text-[14px] text-[#F0F0F0] font-mono">
                        {truncateAddr(bidder)}
                      </td>
                      <td className="px-5 py-[14px] font-body text-[14px] text-[#888888] font-mono">
                        {isWinner && price
                          ? formatUsd(price as bigint)
                          : "Encrypted"}
                      </td>
                      <td className="px-5 py-[14px]">
                        {hasDeposit ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#00E87B]/10 text-[#00E87B] border border-[#00E87B]/20">
                            <CheckCircle size={12} />
                            Qualified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#FF4444]/10 text-[#FF4444] border border-[#FF4444]/20">
                            <XCircle size={12} />
                            Disqualified
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-[14px]">
                        {currentState !== undefined &&
                        currentState >= TenderState.REVEALED ? (
                          isWinner ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-[4px] font-heading text-[11px] font-bold bg-[#00E87B] text-[#08090E] tracking-[1px]">
                              WINNER
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-[4px] font-heading text-[11px] font-bold bg-[#FF4444]/10 text-[#FF4444] tracking-[1px]">
                              REJECTED
                            </span>
                          )
                        ) : (
                          <span className="font-body text-[12px] text-[#666666]">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Back button */}
      <div className="flex items-center gap-3">
        <Link
          href={`/tenders/${id}`}
          className="flex items-center gap-2 px-4 py-[10px] bg-[#0D0F14] border border-[#1E2230] text-[#888888] rounded-[6px] font-body text-[14px] hover:border-[#00E87B]/30 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Tender
        </Link>
      </div>
    </div>
  );
}
