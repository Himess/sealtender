"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAccount, useReadContracts } from "wagmi";
import { parseAbi } from "viem";
import { Send, Lock, Trophy, Wallet, Star, FileText } from "lucide-react";
import {
  useAllTenderAddresses,
  useAllTendersData,
  stateLabel,
  stateColor,
  formatDeadline,
  formatUsd,
  truncateAddr,
} from "@/hooks/useContractData";
import { EncryptedTenderABI, TenderState } from "@/lib/contracts";

const tenderAbi = parseAbi(EncryptedTenderABI);

export default function BidsPage() {
  const { address: userAddress, isConnected } = useAccount();
  const { data: addresses, isLoading: loadingAddresses } =
    useAllTenderAddresses();

  const addrList = addresses as readonly `0x${string}`[] | undefined;

  // Check hasBid for each tender
  const hasBidContracts = useMemo(() => {
    if (!addrList || !userAddress) return [];
    return addrList.map((addr) => ({
      address: addr,
      abi: tenderAbi,
      functionName: "hasBid" as const,
      args: [userAddress] as const,
    }));
  }, [addrList, userAddress]);

  const { data: hasBidResults, isLoading: loadingHasBid } = useReadContracts({
    contracts: hasBidContracts,
    query: { enabled: hasBidContracts.length > 0 },
  });

  // Get deposit info for tenders where user has bid
  const depositContracts = useMemo(() => {
    if (!addrList || !userAddress || !hasBidResults) return [];
    return addrList
      .filter((_, i) => hasBidResults[i]?.status === "success" && hasBidResults[i]?.result === true)
      .map((addr) => ({
        address: addr,
        abi: tenderAbi,
        functionName: "getBidDeposit" as const,
        args: [userAddress] as const,
      }));
  }, [addrList, userAddress, hasBidResults]);

  const { data: depositResults } = useReadContracts({
    contracts: depositContracts,
    query: { enabled: depositContracts.length > 0 },
  });

  const { tenders, isLoading: loadingTenders } = useAllTendersData(addrList);

  const isLoading = loadingAddresses || loadingHasBid || loadingTenders;

  // Filter tenders where user has bid
  const myBids = useMemo(() => {
    if (!hasBidResults || !addrList) return [];
    const bidTenders: Array<{
      tender: (typeof tenders)[0];
      deposit: bigint;
    }> = [];

    let depositIdx = 0;
    for (let i = 0; i < addrList.length; i++) {
      if (
        hasBidResults[i]?.status === "success" &&
        hasBidResults[i]?.result === true
      ) {
        const tender = tenders.find((t) => t.address === addrList[i]);
        if (tender) {
          const dep =
            depositResults?.[depositIdx]?.status === "success"
              ? (depositResults[depositIdx].result as bigint)
              : BigInt(0);
          bidTenders.push({ tender, deposit: dep });
        }
        depositIdx++;
      }
    }
    return bidTenders;
  }, [hasBidResults, addrList, tenders, depositResults]);

  // Stats
  const activeBids = myBids.filter(
    (b) =>
      b.tender.state === TenderState.BIDDING ||
      b.tender.state === TenderState.CLOSED ||
      b.tender.state === TenderState.EVALUATING
  ).length;

  const totalDeposited = myBids.reduce(
    (sum, b) => sum + b.deposit,
    BigInt(0)
  );

  const wins = myBids.filter(
    (b) =>
      b.tender.state === TenderState.REVEALED &&
      b.tender.winner?.toLowerCase() === userAddress?.toLowerCase()
  ).length;

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Wallet size={40} className="text-[#3A3F4B] mx-auto" />
          <p className="text-[#6B7280]">Connect your wallet to view your bids</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#F0F2F5]">
          My Bids
        </h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Your encrypted bid submissions across all tenders
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-[#6B7280] mb-2">
            <Send size={14} />
            Active Bids
          </div>
          {isLoading ? (
            <div className="h-7 w-10 bg-[#1A1D27] rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-heading font-bold text-[#F0F2F5]">
              {activeBids}
            </p>
          )}
        </div>
        <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-[#6B7280] mb-2">
            <Wallet size={14} />
            Total Deposited
          </div>
          {isLoading ? (
            <div className="h-7 w-20 bg-[#1A1D27] rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-heading font-bold text-[#F0F2F5] font-mono">
              {formatUsd(totalDeposited)}
            </p>
          )}
        </div>
        <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-[#6B7280] mb-2">
            <Trophy size={14} />
            Wins
          </div>
          {isLoading ? (
            <div className="h-7 w-6 bg-[#1A1D27] rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-heading font-bold text-[#00E87B]">
              {wins}
            </p>
          )}
        </div>
        <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-[#6B7280] mb-2">
            <Star size={14} />
            Total Bids
          </div>
          {isLoading ? (
            <div className="h-7 w-6 bg-[#1A1D27] rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-heading font-bold text-[#F0F2F5]">
              {myBids.length}
            </p>
          )}
        </div>
      </div>

      {/* Bids Table */}
      <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1A1D27]">
          <h2 className="text-base font-heading font-semibold text-[#F0F2F5]">
            Bid History
          </h2>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-4 items-center">
                <div className="h-4 w-8 bg-[#1A1D27] rounded animate-pulse" />
                <div className="h-4 flex-1 bg-[#1A1D27] rounded animate-pulse" />
                <div className="h-4 w-20 bg-[#1A1D27] rounded animate-pulse" />
                <div className="h-5 w-16 bg-[#1A1D27] rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : myBids.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={32} className="text-[#3A3F4B] mx-auto mb-3" />
            <p className="text-sm text-[#6B7280]">
              You have not submitted any bids yet
            </p>
            <Link
              href="/tenders"
              className="inline-flex items-center gap-2 mt-3 text-sm text-[#00E87B] hover:text-[#00E87B]/80"
            >
              Browse Tenders &rarr;
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-[#6B7280] uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium">Tender</th>
                  <th className="text-left px-5 py-3 font-medium">
                    Description
                  </th>
                  <th className="text-left px-5 py-3 font-medium">Deposit</th>
                  <th className="text-left px-5 py-3 font-medium">
                    Deadline
                  </th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Result</th>
                  <th className="text-right px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {myBids.map(({ tender, deposit }) => {
                  const isWinner =
                    tender.state === TenderState.REVEALED &&
                    tender.winner?.toLowerCase() ===
                      userAddress?.toLowerCase();
                  return (
                    <tr
                      key={tender.address}
                      className="border-t border-[#1A1D27] hover:bg-[#151820] transition-colors"
                    >
                      <td className="px-5 py-3.5 text-sm text-[#A0A8B8] font-mono">
                        #{tender.index}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-[#F0F2F5] max-w-[200px] truncate">
                        {tender.config?.description || "Unnamed"}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-[#A0A8B8] font-mono">
                        {formatUsd(deposit)}
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
                      <td className="px-5 py-3.5">
                        {tender.state === TenderState.REVEALED ? (
                          isWinner ? (
                            <span className="flex items-center gap-1 text-xs text-[#00E87B]">
                              <Trophy size={12} />
                              Won
                            </span>
                          ) : (
                            <span className="text-xs text-[#FF4444]">
                              Lost
                            </span>
                          )
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-[#6B7280]">
                            <Lock size={12} />
                            Encrypted
                          </span>
                        )}
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
