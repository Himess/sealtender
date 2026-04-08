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
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#F0F2F5]">
          Settings
        </h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Wallet and protocol configuration
        </p>
      </div>

      {/* Wallet */}
      <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm text-[#F0F2F5] font-medium">
          <Wallet size={16} className="text-[#00E87B]" />
          Wallet
        </div>

        {isConnected ? (
          <div className="space-y-3">
            <div className="bg-[#0C0D14] rounded-lg p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-[#6B7280]">Address</span>
                <p className="text-sm text-[#F0F2F5] font-mono mt-0.5">
                  {address}
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(address || "")}
                className="text-[#6B7280] hover:text-[#A0A8B8] transition-colors"
              >
                <Copy size={14} />
              </button>
            </div>
            <div className="bg-[#0C0D14] rounded-lg p-4">
              <span className="text-xs text-[#6B7280]">Network</span>
              <p className="text-sm text-[#F0F2F5] mt-0.5">
                {chain?.name || "Unknown"} (Chain ID: {chain?.id || "--"})
              </p>
            </div>
            <button
              onClick={() => disconnect()}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#FF4444]/10 border border-[#FF4444]/20 text-[#FF4444] rounded-lg text-sm hover:bg-[#FF4444]/20 transition-colors"
            >
              <LogOut size={14} />
              Disconnect Wallet
            </button>
          </div>
        ) : (
          <div className="bg-[#0C0D14] rounded-lg p-6 text-center space-y-3">
            <p className="text-sm text-[#6B7280]">No wallet connected</p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        )}
      </div>

      {/* Network */}
      <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm text-[#F0F2F5] font-medium">
          <Globe size={16} className="text-[#4A9FFF]" />
          Network Configuration
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between bg-[#0C0D14] rounded-lg px-4 py-3">
            <span className="text-[#6B7280]">Target Network</span>
            <span className="text-[#A0A8B8]">Sepolia Testnet</span>
          </div>
          <div className="flex justify-between bg-[#0C0D14] rounded-lg px-4 py-3">
            <span className="text-[#6B7280]">Chain ID</span>
            <span className="text-[#A0A8B8] font-mono">11155111</span>
          </div>
          <div className="flex justify-between bg-[#0C0D14] rounded-lg px-4 py-3">
            <span className="text-[#6B7280]">FHE Provider</span>
            <span className="text-[#00E87B]">Zama fhEVM</span>
          </div>
        </div>
      </div>

      {/* Protocol Info */}
      <div className="bg-[#0F1117] border border-[#1A1D27] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm text-[#F0F2F5] font-medium">
          <Shield size={16} className="text-[#A855F7]" />
          Protocol Contracts
        </div>
        <div className="space-y-2">
          {Object.entries(ADDRESSES).map(([name, addr]) => (
            <div
              key={name}
              className="flex items-center justify-between bg-[#0C0D14] rounded-lg px-4 py-3"
            >
              <span className="text-xs text-[#A0A8B8]">{name}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#6B7280] font-mono hidden md:block">
                  {addr}
                </span>
                <span className="text-[10px] text-[#6B7280] font-mono md:hidden">
                  {addr.slice(0, 10)}...{addr.slice(-6)}
                </span>
                <a
                  href={`https://sepolia.etherscan.io/address/${addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#6B7280] hover:text-[#A0A8B8] transition-colors"
                >
                  <ExternalLink size={10} />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Version */}
      <div className="text-center text-xs text-[#3A3F4B] space-y-1">
        <p>SealTender Protocol v0.1.0</p>
        <p>Powered by Zama fhEVM &middot; Sepolia Testnet</p>
      </div>
    </div>
  );
}
