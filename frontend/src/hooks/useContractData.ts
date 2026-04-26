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

export function useTenderSpec(tenderId: bigint | undefined) {
  return useReadContract({
    address: ADDRESSES.TenderFactory,
    abi: factoryAbi,
    functionName: "getTenderSpec",
    args: tenderId !== undefined ? [tenderId] : undefined,
    query: { enabled: tenderId !== undefined },
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

export function useTenderSpecOnChain(addr: `0x${string}` | undefined) {
  return useReadContract({
    address: addr,
    abi: tenderAbi,
    functionName: "getSpec",
    query: { enabled: !!addr },
  });
}

export function useTenderCreator(addr: `0x${string}` | undefined) {
  return useReadContract({
    address: addr,
    abi: tenderAbi,
    functionName: "creator",
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
    weightYears: number;
    weightProjects: number;
    weightBond: number;
    minYears: number;
    minProjects: number;
    minBond: bigint;
    escrowAmount: bigint;
    maxBidders: bigint;
    minReputation: bigint;
  };
  spec?: {
    category: string;
    totalAreaM2: bigint;
    estimatedValueMin: bigint;
    estimatedValueMax: bigint;
    boqReference: string;
    standardsReference: string;
    completionDays: bigint;
    liquidatedDamages: bigint;
  };
  creator?: `0x${string}`;
  state?: number;
  bidderCount?: bigint;
  winner?: `0x${string}`;
  revealedPrice?: bigint;
  totalDeposits?: bigint;
}

export function useAllTendersData(addresses: readonly `0x${string}`[] | undefined) {
  const contracts_list = addresses
    ? addresses.flatMap((addr) => [
        {
          address: addr,
          abi: tenderAbi,
          functionName: "getConfig" as const,
        },
        {
          address: addr,
          abi: tenderAbi,
          functionName: "getSpec" as const,
        },
        {
          address: addr,
          abi: tenderAbi,
          functionName: "creator" as const,
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
    const fieldsPerTender = 8;
    for (let i = 0; i < addresses.length; i++) {
      const base = i * fieldsPerTender;
      const configResult = result.data[base];
      const specResult = result.data[base + 1];
      const creatorResult = result.data[base + 2];
      const stateResult = result.data[base + 3];
      const bidderResult = result.data[base + 4];
      const winnerResult = result.data[base + 5];
      const priceResult = result.data[base + 6];
      const depositsResult = result.data[base + 7];

      const tender: TenderData = {
        address: addresses[i],
        index: i,
      };

      if (configResult?.status === "success" && configResult.result) {
        tender.config = parseConfig(configResult.result);
      }

      if (specResult?.status === "success" && specResult.result) {
        tender.spec = parseSpec(specResult.result);
      }

      if (creatorResult?.status === "success") {
        tender.creator = creatorResult.result as `0x${string}`;
      }

      if (stateResult?.status === "success") {
        tender.state = Number(stateResult.result);
      }

      if (bidderResult?.status === "success") {
        tender.bidderCount = bidderResult.result as bigint;
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
// Tuple Parsers
// ============================================================================

export function parseConfig(raw: unknown): NonNullable<TenderData["config"]> {
  const r = raw as Record<string, unknown> & readonly unknown[];
  // Viem returns struct tuples as objects with named keys for named structs
  // but can also return tuple arrays — handle both shapes.
  const description = (r.description ?? r[0]) as string;
  const deadline = (r.deadline ?? r[1]) as bigint;
  const weightYears = Number(r.weightYears ?? r[2]);
  const weightProjects = Number(r.weightProjects ?? r[3]);
  const weightBond = Number(r.weightBond ?? r[4]);
  const minYears = Number(r.minYears ?? r[5]);
  const minProjects = Number(r.minProjects ?? r[6]);
  const minBond = (r.minBond ?? r[7]) as bigint;
  const escrowAmount = (r.escrowAmount ?? r[8]) as bigint;
  const maxBidders = (r.maxBidders ?? r[9]) as bigint;
  const minReputation = (r.minReputation ?? r[10]) as bigint;
  return {
    description,
    deadline,
    weightYears,
    weightProjects,
    weightBond,
    minYears,
    minProjects,
    minBond,
    escrowAmount,
    maxBidders,
    minReputation,
  };
}

export function parseSpec(raw: unknown): NonNullable<TenderData["spec"]> {
  const r = raw as Record<string, unknown> & readonly unknown[];
  return {
    category: (r.category ?? r[0]) as string,
    totalAreaM2: (r.totalAreaM2 ?? r[1]) as bigint,
    estimatedValueMin: (r.estimatedValueMin ?? r[2]) as bigint,
    estimatedValueMax: (r.estimatedValueMax ?? r[3]) as bigint,
    boqReference: (r.boqReference ?? r[4]) as string,
    standardsReference: (r.standardsReference ?? r[5]) as string,
    completionDays: (r.completionDays ?? r[6]) as bigint,
    liquidatedDamages: (r.liquidatedDamages ?? r[7]) as bigint,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

export function stateLabel(state: number | undefined): string {
  switch (state) {
    case TenderState.Created:
      return "Created";
    case TenderState.Bidding:
      return "Bidding";
    case TenderState.Bidding:
      return "Closed";
    case TenderState.Evaluating:
      return "Evaluating";
    case TenderState.Revealed:
      return "Revealed";
    case TenderState.Cancelled:
      return "Cancelled";
    default:
      return "Unknown";
  }
}

export function stateColor(state: number | undefined): string {
  switch (state) {
    case TenderState.Created:
      return "text-[#888888] bg-[#888888]/10 border-[#888888]/20";
    case TenderState.Bidding:
      return "text-[#00E87B] bg-[#00E87B]/10 border-[#00E87B]/20";
    case TenderState.Bidding:
      return "text-[#FFB800] bg-[#FFB800]/10 border-[#FFB800]/20";
    case TenderState.Evaluating:
      return "text-[#4A9FFF] bg-[#4A9FFF]/10 border-[#4A9FFF]/20";
    case TenderState.Revealed:
      return "text-[#A855F7] bg-[#A855F7]/10 border-[#A855F7]/20";
    case TenderState.Cancelled:
      return "text-[#FF4444] bg-[#FF4444]/10 border-[#FF4444]/20";
    default:
      return "text-[#666666] bg-[#666666]/10 border-[#666666]/20";
  }
}

export function stateFilterKey(state: number | undefined): string {
  switch (state) {
    case TenderState.Created:
      return "created";
    case TenderState.Bidding:
      return "bidding";
    case TenderState.Bidding:
      return "closed";
    case TenderState.Evaluating:
      return "evaluating";
    case TenderState.Revealed:
      return "revealed";
    case TenderState.Cancelled:
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

// USD values from the spec are stored as 6-decimal fixed-point (USDC style).
export function formatUsd6(amount: bigint | undefined): string {
  if (amount === undefined || amount === null) return "—";
  const value = Number(amount) / 1_000_000;
  if (value === 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: bigint | number | undefined): string {
  if (value === undefined || value === null) return "—";
  const n = typeof value === "bigint" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

// ST-YYYY-NNN official reference number.
export function formatTenderRef(
  index: number,
  deadline: bigint | undefined
): string {
  const year = deadline
    ? new Date(Number(deadline) * 1000).getFullYear()
    : new Date().getFullYear();
  const num = String(index + 1).padStart(3, "0");
  return `ST-${year}-${num}`;
}

export function formatIssueDate(deadline: bigint | undefined): string {
  // We don't have contract creation date exposed; derive a plausible
  // "issue date" by backing off 30 days from the submission deadline.
  if (!deadline) return "—";
  const date = new Date(Number(deadline) * 1000 - 30 * 24 * 60 * 60 * 1000);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateLong(deadline: bigint | undefined): string {
  if (!deadline) return "—";
  return new Date(Number(deadline) * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function categoryLabel(category: string | undefined): string {
  if (!category) return "General";
  const normalized = category.toLowerCase();
  switch (normalized) {
    case "construction":
      return "Construction";
    case "it":
      return "Information Technology";
    case "furniture":
      return "Furniture & Equipment";
    case "vehicle":
      return "Vehicles & Transport";
    default:
      return category.charAt(0).toUpperCase() + category.slice(1);
  }
}

export function categorySector(category: string | undefined): string {
  if (!category) return "the Sector";
  const normalized = category.toLowerCase();
  switch (normalized) {
    case "construction":
      return "Construction";
    case "it":
      return "IT Integration";
    case "furniture":
      return "Furniture Manufacturing";
    case "vehicle":
      return "Automotive Supply";
    default:
      return category;
  }
}

export function categoryBadgeColor(category: string | undefined): string {
  if (!category) return "text-[#888888] bg-[#888888]/10 border-[#888888]/20";
  const normalized = category.toLowerCase();
  switch (normalized) {
    case "construction":
      return "text-[#FFB800] bg-[#FFB800]/10 border-[#FFB800]/20";
    case "it":
      return "text-[#4A9FFF] bg-[#4A9FFF]/10 border-[#4A9FFF]/20";
    case "furniture":
      return "text-[#A855F7] bg-[#A855F7]/10 border-[#A855F7]/20";
    case "vehicle":
      return "text-[#00E87B] bg-[#00E87B]/10 border-[#00E87B]/20";
    default:
      return "text-[#888888] bg-[#888888]/10 border-[#888888]/20";
  }
}
