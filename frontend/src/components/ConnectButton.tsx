"use client";

import { ConnectButton as RainbowConnectButton } from "@rainbow-me/rainbowkit";
import { Shield } from "lucide-react";

export function ConnectButton() {
  return (
    <RainbowConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none" as const,
                userSelect: "none" as const,
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#00E87B] text-[#08090E] rounded-lg font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
                  >
                    <Shield size={16} />
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#FF4444] text-white rounded-lg font-semibold text-sm hover:bg-[#FF4444]/90 transition-colors"
                  >
                    Wrong Network
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  <button
                    onClick={openChainModal}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#0F1117] border border-[#1A1D27] rounded-lg text-xs text-[#A0A8B8] hover:border-[#00E87B]/30 transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full bg-[#00E87B]" />
                    {chain.name}
                  </button>
                  <button
                    onClick={openAccountModal}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#0F1117] border border-[#1A1D27] rounded-lg text-sm text-[#F0F2F5] hover:border-[#00E87B]/30 transition-colors"
                  >
                    {account.displayName}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </RainbowConnectButton.Custom>
  );
}
