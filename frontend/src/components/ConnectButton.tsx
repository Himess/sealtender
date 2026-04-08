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
                    className="flex items-center gap-2 px-5 py-[10px] bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
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
                    className="flex items-center gap-2 px-5 py-[10px] bg-[#FF4444] text-white rounded-[6px] font-semibold text-sm hover:bg-[#FF4444]/90 transition-colors"
                  >
                    Wrong Network
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  <button
                    onClick={openChainModal}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#0D0F14] border border-[#1E2230] rounded-[6px] text-xs text-[#888888] hover:border-[#00E87B]/30 transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full bg-[#00E87B]" />
                    {chain.name}
                  </button>
                  <button
                    onClick={openAccountModal}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#0D0F14] border border-[#1E2230] rounded-[6px] font-body text-[14px] text-[#F0F0F0] hover:border-[#00E87B]/30 transition-colors"
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
