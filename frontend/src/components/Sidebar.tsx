"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import {
  LayoutGrid,
  FileText,
  Lock,
  AlertTriangle,
  Star,
  Settings,
  ShieldCheck,
  User,
} from "lucide-react";
import { truncateAddr } from "@/hooks/useContractData";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/tenders", label: "Tenders", icon: FileText },
  { href: "/bids", label: "My Bids", icon: Lock },
  { href: "/disputes", label: "Disputes", icon: AlertTriangle },
  { href: "/reputation", label: "Reputation", icon: Star },
];

export function Sidebar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();

  return (
    <aside className="fixed top-0 left-0 w-[260px] h-screen bg-[#0D0F14] flex flex-col z-50 py-8 px-6 justify-between">
      {/* Top Section */}
      <div className="flex flex-col gap-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[4px] bg-[#00E87B] flex items-center justify-center">
            <ShieldCheck size={20} className="text-[#08090E]" />
          </div>
          <span className="font-heading text-[20px] font-bold text-[#F0F0F0]">
            SealTender
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex flex-col gap-1">
          <span className="font-heading text-[11px] font-semibold text-[#555555] tracking-[2px] uppercase mb-3 px-3">
            MENU
          </span>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-[10px] w-full py-[10px] px-3 transition-all ${
                  isActive
                    ? "bg-[#151820] rounded-[6px]"
                    : "hover:bg-[#151820]/50 rounded-[6px]"
                }`}
              >
                <Icon
                  size={18}
                  className={isActive ? "text-[#00E87B]" : "text-[#666666]"}
                />
                <span
                  className={`font-body text-[14px] ${
                    isActive
                      ? "font-semibold text-[#F0F0F0]"
                      : "font-medium text-[#888888]"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section */}
      <div className="flex flex-col gap-4">
        {/* Settings Link */}
        <Link
          href="/settings"
          className={`flex items-center gap-[10px] py-2 transition-all ${
            pathname === "/settings"
              ? "text-[#F0F0F0]"
              : "text-[#666666] hover:text-[#888888]"
          }`}
        >
          <Settings size={16} className="text-[#666666]" />
          <span className="font-body text-[13px] text-[#666666]">
            Settings
          </span>
        </Link>

        {/* Divider */}
        <div className="h-px bg-[#1E2230]" />

        {/* Wallet Section */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#151820] border border-[#1E2230] flex items-center justify-center">
            <User size={16} className="text-[#666666]" />
          </div>
          <div className="flex flex-col">
            <span className="font-body text-[13px] font-semibold text-[#F0F0F0]">
              {isConnected ? "Admin" : "Not Connected"}
            </span>
            <span className="font-body text-[11px] text-[#666666]">
              {isConnected ? truncateAddr(address) : "Connect wallet"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
