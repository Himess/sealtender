"use client";

import { useState, useMemo } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseAbi } from "viem";
import {
  ShieldCheck,
  Plus,
  Trash2,
  X,
  Loader2,
  CheckCircle,
  Lock,
  Users,
  Settings,
  Copy,
  ExternalLink,
} from "lucide-react";
import { useBidderRegistryCount, truncateAddr } from "@/hooks/useContractData";
import { useTxToast } from "@/hooks/useTxToast";
import { Toast } from "@/components/Toast";
import {
  ADDRESSES,
  TenderFactoryABI,
  BidderRegistryABI,
  DisputeManagerABI,
} from "@/lib/contracts";

const factoryAbi = parseAbi(TenderFactoryABI);
const registryAbi = parseAbi(BidderRegistryABI);
const disputeAbi = parseAbi(DisputeManagerABI);

export default function AdminPage() {
  const { address: userAddress } = useAccount();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBidderAddr, setNewBidderAddr] = useState("");
  const [newBidderName, setNewBidderName] = useState("");
  const [newBidderRegId, setNewBidderRegId] = useState("");

  // Check ownership — admin actions on this page hit TWO contracts:
  //   • TenderFactory (createTender, setEscalation, setDisputeManager …)
  //   • BidderRegistry (registerBidder, removeBidder)
  // The deployer typically owns both, but we still verify each independently
  // so the gate stays correct if ownership is split for governance later.
  const { data: factoryOwner, isLoading: loadingFactoryOwner } = useReadContract({
    address: ADDRESSES.TenderFactory,
    abi: factoryAbi,
    functionName: "owner",
  });
  const { data: registryOwner, isLoading: loadingRegistryOwner } = useReadContract({
    address: ADDRESSES.BidderRegistry,
    abi: registryAbi,
    functionName: "owner",
  });

  const loadingOwner = loadingFactoryOwner || loadingRegistryOwner;

  const lc = (a: unknown) => (typeof a === "string" ? a.toLowerCase() : "");
  const userLc = lc(userAddress);
  const isFactoryOwner = Boolean(userLc) && userLc === lc(factoryOwner);
  const isRegistryOwner = Boolean(userLc) && userLc === lc(registryOwner);
  const isOwner = isFactoryOwner || isRegistryOwner;

  // Bidder registry
  const { data: bidderCount, isLoading: loadingBidders } =
    useBidderRegistryCount();
  const count = bidderCount ? Number(bidderCount) : 0;

  // Read all bidder addresses
  const addressContracts = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      address: ADDRESSES.BidderRegistry,
      abi: registryAbi,
      functionName: "allBidders" as const,
      args: [BigInt(i)] as const,
    }));
  }, [count]);

  const { data: addressResults } = useReadContracts({
    contracts: addressContracts,
    query: { enabled: count > 0 },
  });

  const bidderAddresses = useMemo(() => {
    if (!addressResults) return [];
    return addressResults
      .filter((r) => r.status === "success")
      .map((r) => r.result as `0x${string}`);
  }, [addressResults]);

  // Read profiles
  const profileContracts = useMemo(() => {
    return bidderAddresses.map((addr) => ({
      address: ADDRESSES.BidderRegistry,
      abi: registryAbi,
      functionName: "getProfile" as const,
      args: [addr] as const,
    }));
  }, [bidderAddresses]);

  const { data: profileResults } = useReadContracts({
    contracts: profileContracts,
    query: { enabled: bidderAddresses.length > 0 },
  });

  const bidders = useMemo(() => {
    if (!profileResults || !bidderAddresses.length) return [];
    // V2 BidderRegistry.getProfile returns the BidderProfile struct:
    // { verified, totalBids, totalWins, totalSlashes, completedOnTime, registeredAt }
    // Identity fields (name, registrationId) are no longer on-chain — names are
    // surfaced from off-chain KYC providers in production. We display the
    // wallet address as the canonical identifier and fall back to a truncated
    // display name where the UI previously showed `name`.
    return bidderAddresses.map((addr, i) => {
      const r = profileResults[i];
      if (r?.status === "success" && r.result) {
        const p = r.result as {
          verified: boolean;
          totalBids: bigint;
          totalWins: bigint;
          totalSlashes: bigint;
          completedOnTime: bigint;
          registeredAt: bigint;
        };
        return {
          address: addr,
          name: `Bidder ${addr.slice(0, 6)}…${addr.slice(-4)}`,
          registrationId: addr,
          registeredAt: p.registeredAt,
          active: p.verified,
          totalBids: p.totalBids,
          totalWins: p.totalWins,
          totalSlashes: p.totalSlashes,
          completedOnTime: p.completedOnTime,
        };
      }
      return {
        address: addr,
        name: "",
        registrationId: "",
        registeredAt: BigInt(0),
        active: false,
        totalBids: BigInt(0),
        totalWins: BigInt(0),
        totalSlashes: BigInt(0),
        completedOnTime: BigInt(0),
      };
    });
  }, [profileResults, bidderAddresses]);

  // Protocol settings: in V2 the company complaint stake is per-tender
  // (escrowAmount * 5%), so a single global "company fee" no longer exists.
  // Surface the underlying constants — citizen stake (flat) and the company
  // stake basis-points — so admins see the formula, not a misleading sample.
  const { data: citizenStake } = useReadContract({
    address: ADDRESSES.DisputeManager,
    abi: disputeAbi,
    functionName: "CITIZEN_STAKE",
  });
  const { data: companyStakeBps } = useReadContract({
    address: ADDRESSES.DisputeManager,
    abi: disputeAbi,
    functionName: "COMPLAINT_STAKE_BPS",
  });

  // Add bidder
  const {
    writeContract: writeAdd,
    data: addHash,
    isPending: isAdding,
    error: addError,
  } = useWriteContract();

  const { isLoading: addConfirming, isSuccess: addSuccess } =
    useWaitForTransactionReceipt({ hash: addHash });

  // Remove bidder
  const {
    writeContract: writeRemove,
    data: removeHash,
    isPending: isRemoving,
    error: removeError,
  } = useWriteContract();

  const { isSuccess: removeSuccess } = useWaitForTransactionReceipt({
    hash: removeHash,
  });

  const { toast: addToast, dismiss: dismissAddToast } = useTxToast({
    error: addError,
    isSuccess: addSuccess,
    successMessage: "Bidder registered successfully.",
    errorPrefix: "Register bidder failed",
  });

  const { toast: removeToast, dismiss: dismissRemoveToast } = useTxToast({
    error: removeError,
    isSuccess: removeSuccess,
    successMessage: "Bidder removed.",
    errorPrefix: "Remove bidder failed",
  });

  function handleAddBidder() {
    if (!newBidderAddr) return;
    // V2: registerBidder takes only the bidder address. Off-chain KYC providers
    // map address → identity (name, registration id). The newBidderName /
    // newBidderRegId inputs are kept in the form for the off-chain index.
    writeAdd({
      address: ADDRESSES.BidderRegistry,
      abi: registryAbi,
      functionName: "registerBidder",
      args: [newBidderAddr as `0x${string}`],
    });
  }

  function handleRemoveBidder(addr: `0x${string}`) {
    writeRemove({
      address: ADDRESSES.BidderRegistry,
      abi: registryAbi,
      functionName: "removeBidder",
      args: [addr],
    });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  if (loadingOwner) {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        aria-label="Loading admin panel"
        className="flex flex-col gap-8"
      >
        <div className="h-8 w-36 bg-[#1E2230] rounded-lg animate-pulse" />
        <div className="h-4 w-64 bg-[#1E2230] rounded animate-pulse" />
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-8">
          <div className="h-20 bg-[#1E2230] rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3 max-w-md">
          <div className="w-12 h-12 rounded-lg bg-[#FF4444]/10 border border-[#FF4444]/20 flex items-center justify-center mx-auto">
            <Lock size={24} className="text-[#FF4444]" />
          </div>
          <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
            Access Denied
          </h2>
          <p className="font-body text-[14px] text-[#888888]">
            This page is restricted to the protocol owner. Connect with the
            owner wallet to access admin functions.
          </p>
          {typeof factoryOwner === "string" && (
            <p className="font-body text-[12px] text-[#666666] font-mono">
              Owner: {truncateAddr(factoryOwner)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
            Admin Panel
          </h1>
          <p className="font-body text-[14px] text-[#666666] mt-1">
            Protocol management and bidder whitelist
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#00E87B]/10 border border-[#00E87B]/20 rounded-[6px]">
          <ShieldCheck size={14} className="text-[#00E87B]" />
          <span className="font-body text-[12px] text-[#00E87B] font-medium">Owner</span>
        </div>
      </div>

      {/* Bidder Whitelist */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-[14px] border-b border-[#1E2230]">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[#4A9FFF]" />
            <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
              Bidder Whitelist
            </h2>
            <span className="font-body text-[12px] text-[#666666]">({count})</span>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={!isRegistryOwner}
            title={
              !isRegistryOwner
                ? "Only the BidderRegistry owner can register bidders."
                : undefined
            }
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-xs hover:bg-[#00E87B]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
            Add Bidder
          </button>
        </div>

        {loadingBidders ? (
          <div
            aria-busy="true"
            aria-live="polite"
            aria-label="Loading bidders"
            className="p-5 space-y-3"
          >
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-4 items-center">
                <div className="h-4 flex-1 bg-[#1E2230] rounded animate-pulse" />
                <div className="h-4 w-20 bg-[#1E2230] rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : bidders.length === 0 ? (
          <div className="p-8 text-center">
            <Users size={24} className="text-[#555555] mx-auto mb-2" />
            <p className="font-body text-[14px] text-[#666666]">
              No bidders registered yet
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1E2230]">
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Name</th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Address</th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Reg. ID</th>
                  <th scope="col" className="text-left px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Status</th>
                  <th scope="col" className="text-right px-5 py-[14px] font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {bidders.map((bidder) => (
                  <tr
                    key={bidder.address}
                    className="border-b border-[#1E2230] hover:bg-[#151820] transition-colors"
                  >
                    <td className="px-5 py-[14px] font-body text-[14px] text-[#F0F0F0]">
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
                    <td className="px-5 py-[14px] text-right">
                      <button
                        onClick={() => handleRemoveBidder(bidder.address)}
                        disabled={isRemoving || !isRegistryOwner}
                        aria-label={`Remove bidder ${bidder.name || bidder.address}`}
                        title={
                          !isRegistryOwner
                            ? "Only the BidderRegistry owner can remove bidders."
                            : undefined
                        }
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#FF4444] hover:bg-[#FF4444]/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={12} />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Protocol Settings */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-[#FFB800]" />
          <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
            Protocol Settings
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#0C0D14] rounded-lg p-4">
            <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
              Citizen Complaint Stake
            </span>
            <p className="font-body text-[14px] text-[#F0F0F0] font-mono mt-1">
              {citizenStake !== undefined
                ? `${(Number(citizenStake as bigint) / 1e18).toFixed(4)} ETH`
                : "--"}
            </p>
          </div>
          <div className="bg-[#0C0D14] rounded-lg p-4">
            <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">
              Company Stake (% of escrow)
            </span>
            <p className="font-body text-[14px] text-[#F0F0F0] font-mono mt-1">
              {companyStakeBps !== undefined
                ? `${(Number(companyStakeBps as bigint) / 100).toFixed(2)}%`
                : "--"}
            </p>
          </div>
          <div className="bg-[#0C0D14] rounded-lg p-4">
            <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Network</span>
            <p className="font-body text-[14px] text-[#F0F0F0] mt-1">Sepolia Testnet</p>
          </div>
        </div>
      </div>

      {/* Deployed Contracts */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-4">
        <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
          Deployed Contracts
        </h2>
        <div className="space-y-2">
          {Object.entries(ADDRESSES).map(([name, addr]) => (
            <div
              key={name}
              className="flex items-center justify-between bg-[#0C0D14] rounded-lg px-4 py-3"
            >
              <span className="font-body text-[12px] text-[#888888]">{name}</span>
              <div className="flex items-center gap-2">
                <span className="font-body text-[12px] text-[#666666] font-mono">
                  {truncateAddr(addr)}
                </span>
                <button
                  onClick={() => copyToClipboard(addr)}
                  aria-label={`Copy ${name} address`}
                  className="text-[#666666] hover:text-[#888888] transition-colors"
                >
                  <Copy size={12} />
                </button>
                <a
                  href={`https://sepolia.etherscan.io/address/${addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${name} on Etherscan`}
                  className="text-[#666666] hover:text-[#888888] transition-colors"
                >
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {addToast && (
        <Toast
          message={addToast.message}
          type={addToast.type}
          onClose={dismissAddToast}
        />
      )}
      {removeToast && (
        <Toast
          message={removeToast.message}
          type={removeToast.type}
          onClose={dismissRemoveToast}
        />
      )}

      {/* Add Bidder Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
                Add Bidder
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                aria-label="Close modal"
                className="text-[#666666] hover:text-[#F0F0F0] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {addSuccess ? (
              <div className="text-center space-y-3 py-4">
                <CheckCircle size={32} className="text-[#00E87B] mx-auto" />
                <p className="font-body text-[14px] text-[#F0F0F0]">
                  Bidder registered successfully
                </p>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewBidderAddr("");
                    setNewBidderName("");
                    setNewBidderRegId("");
                  }}
                  className="font-body text-[14px] text-[#00E87B]"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="bidderWalletAddr" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                    Wallet Address
                  </label>
                  <input
                    id="bidderWalletAddr"
                    type="text"
                    value={newBidderAddr}
                    onChange={(e) => setNewBidderAddr(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="bidderCompanyName" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                    Company Name
                  </label>
                  <input
                    id="bidderCompanyName"
                    type="text"
                    value={newBidderName}
                    onChange={(e) => setNewBidderName(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="bidderRegId" className="block font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase mb-1.5">
                    Registration ID
                  </label>
                  <input
                    id="bidderRegId"
                    type="text"
                    value={newBidderRegId}
                    onChange={(e) => setNewBidderRegId(e.target.value)}
                    placeholder="e.g. REG-2024-001"
                    className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
                  />
                </div>

                {addError && (
                  <p className="text-xs text-[#FF4444]">
                    {addError.message.slice(0, 150)}
                  </p>
                )}

                <button
                  onClick={handleAddBidder}
                  disabled={isAdding || addConfirming || !newBidderAddr || !newBidderName}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAdding || addConfirming ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {isAdding ? "Confirm..." : "Registering..."}
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Register Bidder
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
