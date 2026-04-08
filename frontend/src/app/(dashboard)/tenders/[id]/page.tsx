"use client";

import { use } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import {
  ArrowLeft,
  Lock,
  Users,
  Clock,
  Trophy,
  Shield,
  FileText,
  ExternalLink,
} from "lucide-react";
import {
  useTenderAddress,
  useTenderConfig,
  useTenderState,
  useBidderCount,
  useTenderWinner,
  useRevealedPrice,
  useTotalDeposits,
  stateLabel,
  stateColor,
  formatDeadlineFull,
  formatDeadline,
  truncateAddr,
  formatUsd,
} from "@/hooks/useContractData";
import { TenderState } from "@/lib/contracts";

export default function TenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const tenderId = BigInt(id);
  const { address: userAddress } = useAccount();

  const { data: tenderAddress, isLoading: loadingAddr } =
    useTenderAddress(tenderId);
  const addr = tenderAddress as `0x${string}` | undefined;

  const { data: configData, isLoading: loadingConfig } = useTenderConfig(addr);
  const { data: state, isLoading: loadingState } = useTenderState(addr);
  const { data: bidders, isLoading: loadingBidders } = useBidderCount(addr);
  const { data: winner } = useTenderWinner(addr);
  const { data: price } = useRevealedPrice(addr);
  const { data: deposits } = useTotalDeposits(addr);

  const isLoading = loadingAddr || loadingConfig || loadingState;
  const currentState = state !== undefined ? Number(state) : undefined;

  // Parse config tuple
  const config = configData
    ? {
        description: (configData as readonly unknown[])[0] as string,
        deadline: (configData as readonly unknown[])[1] as bigint,
        maxBidders: Number((configData as readonly unknown[])[2]),
        creator: (configData as readonly unknown[])[3] as `0x${string}`,
      }
    : null;

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1A1D27] rounded-lg animate-pulse" />
          <div className="h-7 w-48 bg-[#1A1D27] rounded animate-pulse" />
        </div>
        <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-8 space-y-4">
          <div className="h-6 w-64 bg-[#1A1D27] rounded animate-pulse" />
          <div className="h-4 w-full bg-[#1A1D27] rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-[#1A1D27] rounded animate-pulse" />
          <div className="grid grid-cols-3 gap-4 pt-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-[#1A1D27] rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!addr || addr === "0x0000000000000000000000000000000000000000") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <FileText size={40} className="text-[#3A3F4B] mx-auto" />
          <p className="text-[#6B7280]">Tender #{id} not found</p>
          <Link
            href="/tenders"
            className="text-sm text-[#00E87B] hover:text-[#00E87B]/80"
          >
            &larr; Back to Tenders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/tenders"
            className="w-8 h-8 rounded-lg bg-[#0F1117] border border-[#1A1D27] flex items-center justify-center text-[#A0A8B8] hover:text-[#F0F2F5] hover:border-[#00E87B]/30 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-heading font-bold text-[#F0F2F5]">
              Tender #{id}
            </h1>
            <p className="text-xs text-[#6B7280] font-mono mt-0.5">
              {addr}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${stateColor(
            currentState
          )}`}
        >
          {stateLabel(currentState)}
        </span>
      </div>

      {/* Main Info */}
      <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-heading font-semibold text-[#F0F2F5]">
            {config?.description || "Unnamed Tender"}
          </h2>
          <p className="text-xs text-[#6B7280] mt-1">
            Created by {truncateAddr(config?.creator)}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#0C0D14] rounded-lg p-4">
            <div className="flex items-center gap-2 text-xs text-[#6B7280] mb-2">
              <Users size={14} />
              Bidders
            </div>
            <p className="text-xl font-heading font-bold text-[#F0F2F5]">
              {bidders !== undefined ? String(bidders) : "0"}
              <span className="text-sm text-[#6B7280] font-normal">
                /{config?.maxBidders || "--"}
              </span>
            </p>
          </div>

          <div className="bg-[#0C0D14] rounded-lg p-4">
            <div className="flex items-center gap-2 text-xs text-[#6B7280] mb-2">
              <Clock size={14} />
              Deadline
            </div>
            <p className="text-sm font-medium text-[#F0F2F5]">
              {formatDeadlineFull(config?.deadline)}
            </p>
            <p className="text-xs text-[#A0A8B8] mt-1">
              {formatDeadline(config?.deadline)}
            </p>
          </div>

          <div className="bg-[#0C0D14] rounded-lg p-4">
            <div className="flex items-center gap-2 text-xs text-[#6B7280] mb-2">
              <Lock size={14} />
              Total Deposits
            </div>
            <p className="text-xl font-heading font-bold text-[#F0F2F5] font-mono">
              {formatUsd(deposits as bigint | undefined)}
            </p>
          </div>
        </div>
      </div>

      {/* Winner Box */}
      {currentState !== undefined &&
        currentState >= TenderState.REVEALED &&
        winner &&
        winner !== "0x0000000000000000000000000000000000000000" && (
          <div className="bg-[#A855F7]/5 border border-[#A855F7]/20 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <Trophy size={20} className="text-[#A855F7]" />
              <h3 className="text-base font-heading font-semibold text-[#F0F2F5]">
                Winner Revealed
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[#6B7280] mb-1">Winner Address</p>
                <p className="text-sm text-[#F0F2F5] font-mono">
                  {winner as string}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6B7280] mb-1">Winning Price</p>
                <p className="text-sm text-[#F0F2F5] font-mono">
                  {formatUsd(price as bigint | undefined)}
                </p>
              </div>
            </div>
          </div>
        )}

      {/* Encryption Info */}
      <div className="bg-[#0F1117] border border-[#00E87B]/10 rounded-xl p-5 flex items-center gap-3">
        <Shield size={18} className="text-[#00E87B] shrink-0" />
        <div>
          <p className="text-sm text-[#F0F2F5]">
            All bids are fully encrypted using Zama fhEVM
          </p>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Bid data (price, delivery, qualifications, bond) remain confidential
            until the reveal phase
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {currentState === TenderState.BIDDING && (
          <Link
            href={`/tenders/${id}/bid`}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#00E87B] text-[#08090E] rounded-lg font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
          >
            <Lock size={16} />
            Submit Encrypted Bid
          </Link>
        )}
        <a
          href={`https://sepolia.etherscan.io/address/${addr}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0F1117] border border-[#1A1D27] text-[#A0A8B8] rounded-lg text-sm hover:border-[#00E87B]/30 transition-colors"
        >
          <ExternalLink size={14} />
          Etherscan
        </a>
      </div>
    </div>
  );
}
