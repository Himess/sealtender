"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { AlertTriangle, Loader2 } from "lucide-react";

/**
 * Top-of-page banner shown when the connected wallet is not on Sepolia.
 *
 * SealTender's V2 deployment lives only on Sepolia, so any tx submitted from
 * a different chain would either revert or — worse — silently target a
 * non-existent address. The banner gives users a one-click switch via the
 * connector's `switchChain` capability, with a fallback explanation if the
 * wallet refuses programmatic switching (e.g. some hardware wallets).
 */
export function WrongChainBanner() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending, error } = useSwitchChain();

  if (!isConnected) return null;
  if (chainId === sepolia.id) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="bg-[#FFB800]/10 border-b border-[#FFB800]/30 px-6 py-3 flex items-start gap-3"
    >
      <AlertTriangle size={18} className="text-[#FFB800] mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-body text-[14px] text-[#FFB800] font-medium">
          Wrong network
        </p>
        <p className="font-body text-[12px] text-[#FFB800]/80 mt-0.5">
          SealTender contracts are deployed on Sepolia. You&apos;re currently on
          chain {chainId}. Switch to Sepolia to continue.
          {error ? ` (${error.message.slice(0, 120)})` : null}
        </p>
      </div>
      <button
        onClick={() => switchChain({ chainId: sepolia.id })}
        disabled={isPending}
        aria-label="Switch network to Sepolia"
        aria-busy={isPending}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[#FFB800] text-[#08090E] text-xs font-semibold hover:bg-[#FFB800]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Switching…
          </>
        ) : (
          <>Switch to Sepolia</>
        )}
      </button>
    </div>
  );
}
