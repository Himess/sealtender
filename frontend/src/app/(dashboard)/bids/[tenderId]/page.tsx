"use client";

// Bidder's self-decryption view for one tender.
//
// SealTender keeps every bid encrypted on-chain so observers cannot read price,
// years, projects, or bond. The bidder *can* read their own values via the
// Zama relayer SDK's `userDecrypt` flow: an EIP-712 signature on a
// (contractAddress, time-window) typed-data scope -> the relayer asks the KMS
// threshold quorum to re-encrypt each handle to an ephemeral keypair the
// bidder generates client-side -> only the bidder's wallet decrypts the
// final re-encryption. No middleman ever sees plaintext.
//
// This page is the user-facing surface of that flow: visit
// /bids/<tenderId>/, hit "Reveal My Bid", sign in MetaMask, see your bid.
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { parseAbi, formatUnits } from "viem";
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  Eye,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { ADDRESSES, TenderFactoryABI, EncryptedTenderABI } from "@/lib/contracts";
import { useUserDecryptBid, type DecryptedBid } from "@/hooks/useUserDecryptBid";

const factoryAbi = parseAbi(TenderFactoryABI);
const tenderAbi = parseAbi(EncryptedTenderABI);

export default function ViewMyBidPage() {
  const router = useRouter();
  const params = useParams<{ tenderId: string }>();
  const tenderId = useMemo(() => {
    const v = Number(params?.tenderId);
    return Number.isFinite(v) && v >= 0 ? BigInt(v) : null;
  }, [params]);

  const { address: userAddress, isConnected } = useAccount();
  const { decryptMyBid, loading, error } = useUserDecryptBid();

  // Resolve tender contract address from factory.
  const { data: tenderAddress } = useReadContract({
    address: ADDRESSES.TenderFactory,
    abi: factoryAbi,
    functionName: "getTender",
    args: tenderId !== null ? [tenderId] : undefined,
    query: { enabled: tenderId !== null },
  });

  // Quick gating reads: hasBid + config description so the page can show
  // "you didn't bid here" or "loading..." cleanly.
  const { data: pageReads } = useReadContracts({
    contracts:
      tenderAddress && userAddress
        ? [
            {
              address: tenderAddress as `0x${string}`,
              abi: tenderAbi,
              functionName: "hasBid",
              args: [userAddress as `0x${string}`],
            },
            {
              address: tenderAddress as `0x${string}`,
              abi: tenderAbi,
              functionName: "getConfig",
            },
          ]
        : [],
    query: { enabled: Boolean(tenderAddress && userAddress) },
  });

  const hasBid = pageReads?.[0]?.status === "success" ? Boolean(pageReads[0].result) : null;
  const cfg = pageReads?.[1]?.status === "success" ? (pageReads[1].result as any) : null;
  const description = (cfg?.description as string | undefined) || "Loading...";

  const [decrypted, setDecrypted] = useState<DecryptedBid | null>(null);
  // Reset on tender or wallet change.
  useEffect(() => {
    setDecrypted(null);
  }, [tenderAddress, userAddress]);

  async function handleReveal() {
    if (!tenderAddress) return;
    const result = await decryptMyBid(tenderAddress as `0x${string}`);
    if (result) setDecrypted(result);
  }

  if (tenderId === null) {
    return (
      <div className="flex flex-col gap-4">
        <p className="font-body text-[14px] text-[#FF4444]">Invalid tender id.</p>
        <button
          type="button"
          onClick={() => router.push("/bids")}
          className="font-body text-[14px] text-[#00E87B] hover:text-[#00E87B]/80 inline-flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Back to my bids
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <Link
        href="/bids"
        className="inline-flex items-center gap-1 font-body text-[12px] text-[#666666] hover:text-[#888888] transition-colors w-fit"
      >
        <ArrowLeft size={12} /> Back to My Bids
      </Link>

      <div>
        <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-[10px] font-medium border border-[#A855F7]/20 bg-[#A855F7]/10 text-[#A855F7] uppercase tracking-[1px] mb-3">
          <ShieldCheck size={11} /> User-Decryption (EIP-712)
        </div>
        <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
          Reveal My Bid - Tender #{tenderId.toString()}
        </h1>
        <p className="font-body text-[14px] text-[#666666] mt-1">
          {description}
        </p>
      </div>

      {/* Explainer */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-5 space-y-2">
        <div className="flex items-center gap-2 font-body text-[14px] text-[#F0F0F0] font-medium">
          <Lock size={14} className="text-[#A855F7]" />
          Why your bid is encrypted on-chain
        </div>
        <p className="font-body text-[13px] text-[#888888] leading-relaxed">
          Your bid (price, years, projects, bond) was submitted as an FHE
          ciphertext bound to this contract. Even the procurement entity
          cannot read individual bids during evaluation - only the encrypted
          comparison runs on-chain, and only the winning <em>price</em> is
          ever decrypted via the threshold KMS. To see your own values you
          sign an EIP-712 typed-data request scoped to this contract: the
          relayer asks the KMS quorum to re-encrypt each handle to a
          one-shot keypair your wallet generated, and your wallet decrypts
          the final re-encryption locally. <strong>No party in the chain
          ever sees plaintext.</strong>
        </p>
      </div>

      {/* Connect / hasBid gating */}
      {!isConnected ? (
        <div className="bg-[#0D0F14] border border-[#FFB800]/30 rounded-lg p-5 flex items-center gap-3">
          <AlertTriangle size={16} className="text-[#FFB800] shrink-0" />
          <p className="font-body text-[13px] text-[#FFB800]">
            Connect your wallet to reveal a bid.
          </p>
        </div>
      ) : hasBid === false ? (
        <div className="bg-[#0D0F14] border border-[#FF4444]/30 rounded-lg p-5 flex items-center gap-3">
          <AlertTriangle size={16} className="text-[#FF4444] shrink-0" />
          <p className="font-body text-[13px] text-[#FF4444]">
            This wallet did not submit a bid on tender #{tenderId.toString()}.
            User-decryption only works for the bidder who submitted the bid.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleReveal}
          disabled={loading || hasBid !== true}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#A855F7] text-white font-body text-[14px] font-medium hover:bg-[#A855F7]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-fit"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Awaiting wallet signature + KMS roundtrip...
            </>
          ) : (
            <>
              <Eye size={14} /> Reveal My Bid
            </>
          )}
        </button>
      )}

      {error && (
        <div className="bg-[#0D0F14] border border-[#FF4444]/30 rounded-lg p-5 flex items-start gap-3">
          <AlertTriangle size={16} className="text-[#FF4444] shrink-0 mt-0.5" />
          <div>
            <p className="font-body text-[13px] text-[#FF4444] font-medium">
              Decryption failed
            </p>
            <p className="font-body text-[12px] text-[#FF4444]/80 mt-1 break-all">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* Decrypted display */}
      {decrypted && (
        <div className="bg-[#0D0F14] border border-[#00E87B]/30 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-[#00E87B]" />
            <span className="font-heading text-[12px] font-semibold text-[#00E87B] tracking-[1px] uppercase">
              Decrypted by your wallet only
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Price (encrypted euint64)" value={`${formatUnits(decrypted.price, 6)} USDC`} mono />
            <Field label="Bond (encrypted euint64)" value={`${formatUnits(decrypted.bond, 6)} USDC`} mono />
            <Field label="Delivery Years (euint32)" value={`${decrypted.years.toString()} years`} />
            <Field label="Past Projects (euint32)" value={`${decrypted.projects.toString()} projects`} />
            <Field
              label="Submitted At"
              value={new Date(Number(decrypted.timestamp) * 1000).toLocaleString()}
            />
            <Field label="Bid Version" value={decrypted.version.toString()} mono />
          </div>
          <p className="font-body text-[12px] text-[#666666] border-t border-[#1E2230] pt-4">
            These values are visible only in this browser session. Refresh
            the page or disconnect to clear them - decryption is not stored
            anywhere on-chain or off-chain.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-[#0C0D14] rounded-lg p-4">
      <span className="font-heading text-[10px] font-semibold text-[#666666] tracking-[1px] uppercase">
        {label}
      </span>
      <p
        className={`font-body text-[16px] text-[#F0F0F0] mt-1 ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
