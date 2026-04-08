"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { parseAbi } from "viem";
import {
  ADDRESSES,
  TenderFactoryABI,
  EncryptedTenderABI,
  BidEscrowABI,
  BidderRegistryABI,
  DisputeManagerABI,
  TenderState,
} from "@/lib/contracts";

// ============================================================================
// Parsed ABIs (viem needs parsed ABI for useReadContract)
// ============================================================================

const factoryAbi = parseAbi(TenderFactoryABI);
const tenderAbi = parseAbi(EncryptedTenderABI);
const escrowAbi = parseAbi(BidEscrowABI);
const registryAbi = parseAbi(BidderRegistryABI);
const disputeAbi = parseAbi(DisputeManagerABI);

// ============================================================================
// Factory Hooks
// ============================================================================

export function useTenderCount() {
  return useReadContract({
    address: ADDRESSES.TenderFactory,
    abi: factoryAbi,
    functionName: "tenderCount",
  });
}

export function useTenderAddress(id: bigint) {
  return useReadContract({
    address: ADDRESSES.TenderFactory,
    abi: factoryAbi,
    functionName: "getTender",
    args: [id],
  });
}

export function useAllTenderAddresses() {
  return useReadContract({
    address: ADDRESSES.TenderFactory,
    abi: factoryAbi,
    functionName: "getAllTenders",
  });
}

// ============================================================================
// Single Tender Hooks
// ============================================================================

export function useTenderConfig(addr: `0x${string}` | undefined) {
  return useReadContract({
    address: addr,
    abi: tenderAbi,
    functionName: "getConfig",
    query: { enabled: !!addr },
  });
}

export function useTenderState(addr: `0x${string}` | undefined) {
  return useReadContract({
    address: addr,
    abi: tenderAbi,
    functionName: "currentState",
    query: { enabled: !!addr },
  });
}

export function useBidderCount(addr: `0x${string}` | undefined) {
  return useReadContract({
    address: addr,
    abi: tenderAbi,
    functionName: "bidderCount",
    query: { enabled: !!addr },
  });
}

export function useTenderWinner(addr: `0x${string}` | undefined) {
  return useReadContract({
    address: addr,
    abi: tenderAbi,
    functionName: "winner",
    query: { enabled: !!addr },
  });
}

export function useRevealedPrice(addr: `0x${string}` | undefined) {
  return useReadContract({
    address: addr,
    abi: tenderAbi,
    functionName: "revealedPrice",
    query: { enabled: !!addr },
  });
}

export function useTotalDeposits(addr: `0x${string}` | undefined) {
  return useReadContract({
    address: addr,
    abi: tenderAbi,
    functionName: "totalDeposits",
    query: { enabled: !!addr },
  });
}

// ============================================================================
// Escrow Hooks
// ============================================================================

export function useTotalEscrow(tenderId: bigint) {
  return useReadContract({
    address: ADDRESSES.BidEscrow,
    abi: escrowAbi,
    functionName: "getTotalEscrow",
    args: [tenderId],
  });
}

// ============================================================================
// Registry Hooks
// ============================================================================

export function useBidderRegistryCount() {
  return useReadContract({
    address: ADDRESSES.BidderRegistry,
    abi: registryAbi,
    functionName: "bidderCount",
  });
}

// ============================================================================
// Dispute Hooks
// ============================================================================

export function useDisputeCount() {
  return useReadContract({
    address: ADDRESSES.DisputeManager,
    abi: disputeAbi,
    functionName: "disputeCount",
  });
}

// ============================================================================
// Batch Tender Data
// ============================================================================

export interface TenderData {
  address: `0x${string}`;
  index: number;
  config?: {
    description: string;
    deadline: bigint;
    maxBidders: number;
    creator: `0x${string}`;
  };
  state?: number;
  bidderCount?: bigint;
  winner?: `0x${string}`;
  revealedPrice?: bigint;
  totalDeposits?: bigint;
}

export function useAllTendersData(addresses: readonly `0x${string}`[] | undefined) {
  const contracts_list = addresses
    ? addresses.flatMap((addr, i) => [
        {
          address: addr,
          abi: tenderAbi,
          functionName: "getConfig" as const,
        },
        {
          address: addr,
          abi: tenderAbi,
          functionName: "currentState" as const,
        },
        {
          address: addr,
          abi: tenderAbi,
          functionName: "bidderCount" as const,
        },
        {
          address: addr,
          abi: tenderAbi,
          functionName: "winner" as const,
        },
        {
          address: addr,
          abi: tenderAbi,
          functionName: "revealedPrice" as const,
        },
        {
          address: addr,
          abi: tenderAbi,
          functionName: "totalDeposits" as const,
        },
      ])
    : [];

  const result = useReadContracts({
    contracts: contracts_list,
    query: { enabled: !!addresses && addresses.length > 0 },
  });

  const tenders: TenderData[] = [];

  if (result.data && addresses) {
    const fieldsPerTender = 6;
    for (let i = 0; i < addresses.length; i++) {
      const base = i * fieldsPerTender;
      const configResult = result.data[base];
      const stateResult = result.data[base + 1];
      const bidderResult = result.data[base + 2];
      const winnerResult = result.data[base + 3];
      const priceResult = result.data[base + 4];
      const depositsResult = result.data[base + 5];

      const tender: TenderData = {
        address: addresses[i],
        index: i,
      };

      if (configResult?.status === "success" && Array.isArray(configResult.result)) {
        const [description, deadline, maxBidders, creator] = configResult.result as [string, bigint, number, `0x${string}`];
        tender.config = { description, deadline, maxBidders, creator };
      }

      if (stateResult?.status === "success") {
        tender.state = Number(stateResult.result);
      }

      if (bidderResult?.status === "success") {
        tender.bidderCount = stateResult.result as bigint;
      }

      if (winnerResult?.status === "success") {
        tender.winner = winnerResult.result as `0x${string}`;
      }

      if (priceResult?.status === "success") {
        tender.revealedPrice = priceResult.result as bigint;
      }

      if (depositsResult?.status === "success") {
        tender.totalDeposits = depositsResult.result as bigint;
      }

      tenders.push(tender);
    }
  }

  return {
    ...result,
    tenders,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

export function stateLabel(state: number | undefined): string {
  switch (state) {
    case TenderState.CREATED:
      return "Created";
    case TenderState.BIDDING:
      return "Bidding";
    case TenderState.CLOSED:
      return "Closed";
    case TenderState.EVALUATING:
      return "Evaluating";
    case TenderState.REVEALED:
      return "Revealed";
    case TenderState.CANCELLED:
      return "Cancelled";
    default:
      return "Unknown";
  }
}

export function stateColor(state: number | undefined): string {
  switch (state) {
    case TenderState.CREATED:
      return "text-[#A0A8B8] bg-[#A0A8B8]/10 border-[#A0A8B8]/20";
    case TenderState.BIDDING:
      return "text-[#00E87B] bg-[#00E87B]/10 border-[#00E87B]/20";
    case TenderState.CLOSED:
      return "text-[#FFB800] bg-[#FFB800]/10 border-[#FFB800]/20";
    case TenderState.EVALUATING:
      return "text-[#4A9FFF] bg-[#4A9FFF]/10 border-[#4A9FFF]/20";
    case TenderState.REVEALED:
      return "text-[#A855F7] bg-[#A855F7]/10 border-[#A855F7]/20";
    case TenderState.CANCELLED:
      return "text-[#FF4444] bg-[#FF4444]/10 border-[#FF4444]/20";
    default:
      return "text-[#6B7280] bg-[#6B7280]/10 border-[#6B7280]/20";
  }
}

export function stateFilterKey(state: number | undefined): string {
  switch (state) {
    case TenderState.CREATED:
      return "created";
    case TenderState.BIDDING:
      return "bidding";
    case TenderState.CLOSED:
      return "closed";
    case TenderState.EVALUATING:
      return "evaluating";
    case TenderState.REVEALED:
      return "revealed";
    case TenderState.CANCELLED:
      return "cancelled";
    default:
      return "unknown";
  }
}

export function formatDeadline(deadline: bigint | undefined): string {
  if (!deadline) return "--";
  const date = new Date(Number(deadline) * 1000);
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff < 0) return "Expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;
  return "< 1h left";
}

export function formatDeadlineFull(deadline: bigint | undefined): string {
  if (!deadline) return "--";
  return new Date(Number(deadline) * 1000).toLocaleString();
}

export function truncateAddr(addr: string | undefined): string {
  if (!addr) return "--";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatUsd(wei: bigint | undefined): string {
  if (!wei) return "$0.00";
  const eth = Number(wei) / 1e18;
  return `${eth.toFixed(4)} ETH`;
}
