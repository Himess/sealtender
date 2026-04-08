"use client";

import { useAccount, useDisconnect } from "wagmi";
import {
  Settings,
  Wallet,
  Globe,
  Shield,
  LogOut,
  ExternalLink,
  Copy,
} from "lucide-react";
import { ADDRESSES } from "@/lib/contracts";
import { ConnectButton } from "@/components/ConnectButton";

export default function SettingsPage() {
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
          Settings
        </h1>
        <p className="font-body text-[14px] text-[#666666] mt-1">
          Wallet and protocol configuration
        </p>
      </div>

      {/* Wallet */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2 font-body text-[14px] text-[#F0F0F0] font-medium">
          <Wallet size={16} className="text-[#00E87B]" />
          Wallet
        </div>

        {isConnected ? (
          <div className="space-y-3">
            <div className="bg-[#0C0D14] rounded-lg p-4 flex items-center justify-between">
              <div>
                <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Address</span>
                <p className="font-body text-[14px] text-[#F0F0F0] font-mono mt-0.5">
                  {address}
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(address || "")}
                className="text-[#666666] hover:text-[#888888] transition-colors"
              >
                <Copy size={14} />
              </button>
            </div>
            <div className="bg-[#0C0D14] rounded-lg p-4">
              <span className="font-heading text-[11px] font-semibold text-[#666666] tracking-[1px] uppercase">Network</span>
              <p className="font-body text-[14px] text-[#F0F0F0] mt-0.5">
                {chain?.name || "Unknown"} (Chain ID: {chain?.id || "--"})
              </p>
            </div>
            <button
              onClick={() => disconnect()}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#FF4444]/10 border border-[#FF4444]/20 text-[#FF4444] rounded-[6px] font-body text-[14px] hover:bg-[#FF4444]/20 transition-colors"
            >
              <LogOut size={14} />
              Disconnect Wallet
            </button>
          </div>
        ) : (
          <div className="bg-[#0C0D14] rounded-lg p-6 text-center space-y-3">
            <p className="font-body text-[14px] text-[#666666]">No wallet connected</p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        )}
      </div>

      {/* Network */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2 font-body text-[14px] text-[#F0F0F0] font-medium">
          <Globe size={16} className="text-[#4A9FFF]" />
          Network Configuration
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between bg-[#0C0D14] rounded-lg px-4 py-3">
            <span className="text-[#666666]">Target Network</span>
            <span className="text-[#888888]">Sepolia Testnet</span>
          </div>
          <div className="flex justify-between bg-[#0C0D14] rounded-lg px-4 py-3">
            <span className="text-[#666666]">Chain ID</span>
            <span className="text-[#888888] font-mono">11155111</span>
          </div>
          <div className="flex justify-between bg-[#0C0D14] rounded-lg px-4 py-3">
            <span className="text-[#666666]">FHE Provider</span>
            <span className="text-[#00E87B]">Zama fhEVM</span>
          </div>
        </div>
      </div>

      {/* Protocol Info */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2 font-body text-[14px] text-[#F0F0F0] font-medium">
          <Shield size={16} className="text-[#A855F7]" />
          Protocol Contracts
        </div>
        <div className="space-y-2">
          {Object.entries(ADDRESSES).map(([name, addr]) => (
            <div
              key={name}
              className="flex items-center justify-between bg-[#0C0D14] rounded-lg px-4 py-3"
            >
              <span className="font-body text-[12px] text-[#888888]">{name}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#666666] font-mono hidden md:block">
                  {addr}
                </span>
                <span className="text-[10px] text-[#666666] font-mono md:hidden">
                  {addr.slice(0, 10)}...{addr.slice(-6)}
                </span>
                <a
                  href={`https://sepolia.etherscan.io/address/${addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#666666] hover:text-[#888888] transition-colors"
                >
                  <ExternalLink size={10} />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Version */}
      <div className="text-center font-body text-[12px] text-[#555555] space-y-1">
        <p>SealTender Protocol v0.1.0</p>
        <p>Powered by Zama fhEVM &middot; Sepolia Testnet</p>
      </div>
    </div>
  );
}
