"use client";

import { ConnectButton } from "@/components/ConnectButton";
import { Lock, Shield, Eye, Zap } from "lucide-react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ConnectPage() {
  const { isConnected } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (isConnected) {
      router.push("/");
    }
  }, [isConnected, router]);

  return (
    <div className="min-h-screen bg-[#08090E] flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo */}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-lg bg-[#00E87B]/10 border border-[#00E87B]/20 flex items-center justify-center mx-auto animate-pulse-glow">
            <Lock size={28} className="text-[#00E87B]" />
          </div>
          <div>
            <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
              SealTender
            </h1>
            <p className="font-body text-[14px] text-[#888888] mt-1">
              FHE-Encrypted Procurement Protocol
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="space-y-3">
          {[
            {
              icon: Shield,
              title: "Sealed Bids",
              desc: "Bids encrypted with FHE — invisible to everyone",
            },
            {
              icon: Eye,
              title: "Zero Knowledge",
              desc: "No competing bid visibility until reveal",
            },
            {
              icon: Zap,
              title: "On-Chain Escrow",
              desc: "Trustless deposits with automatic settlement",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="flex items-start gap-3 p-3 rounded-lg bg-[#0D0F14] border border-[#1E2230]"
            >
              <feature.icon
                size={18}
                className="text-[#00E87B] mt-0.5 shrink-0"
              />
              <div>
                <p className="font-body text-[14px] font-medium text-[#F0F0F0]">
                  {feature.title}
                </p>
                <p className="font-body text-[12px] text-[#666666]">{feature.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Connect */}
        <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6 text-center space-y-4">
          <p className="font-body text-[14px] text-[#888888]">
            Connect your wallet to access the procurement dashboard
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
          <p className="font-body text-[12px] text-[#666666]">
            Sepolia Testnet &middot; Zama fhEVM
          </p>
        </div>
      </div>
    </div>
  );
}
