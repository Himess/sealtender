"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import {
  LayoutDashboard,
  FileText,
  Send,
  AlertTriangle,
  TrendingUp,
  Star,
  Settings,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { ConnectButton } from "./ConnectButton";
import { truncateAddr } from "@/hooks/useContractData";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tenders", label: "Tenders", icon: FileText },
  { href: "/bids", label: "My Bids", icon: Send },
  { href: "/disputes", label: "Disputes", icon: AlertTriangle },
  { href: "/escalation", label: "Escalation", icon: TrendingUp },
  { href: "/reputation", label: "Reputation", icon: Star },
  { href: "/admin", label: "Admin", icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();

  return (
    <aside className="fixed top-0 left-0 w-[240px] h-screen bg-[#0A0B10] border-r border-[#1A1D27] flex flex-col z-50">
      {/* Logo */}
      <div className="p-5 border-b border-[#1A1D27]">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#00E87B]/10 border border-[#00E87B]/20 flex items-center justify-center">
            <Lock size={16} className="text-[#00E87B]" />
          </div>
          <div>
            <h1 className="text-base font-heading font-bold text-[#F0F2F5] tracking-tight">
              SealTender
            </h1>
            <p className="text-[10px] text-[#6B7280] tracking-widest uppercase">
              FHE Protocol
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-[#00E87B]/10 text-[#00E87B] border border-[#00E87B]/20"
                  : "text-[#A0A8B8] hover:text-[#F0F2F5] hover:bg-[#151820] border border-transparent"
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Settings */}
      <div className="px-3 pb-2">
        <Link
          href="/settings"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
            pathname === "/settings"
              ? "bg-[#00E87B]/10 text-[#00E87B] border border-[#00E87B]/20"
              : "text-[#A0A8B8] hover:text-[#F0F2F5] hover:bg-[#151820] border border-transparent"
          }`}
        >
          <Settings size={18} />
          Settings
        </Link>
      </div>

      {/* Wallet Status */}
      <div className="p-4 border-t border-[#1A1D27]">
        {isConnected ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#00E87B] animate-pulse-glow" />
              <span className="text-xs text-[#A0A8B8]">Connected</span>
            </div>
            <p className="text-xs font-mono text-[#F0F2F5]">
              {truncateAddr(address)}
            </p>
          </div>
        ) : (
          <ConnectButton />
        )}
      </div>
    </aside>
  );
}
