"use client";

import { Sidebar } from "@/components/Sidebar";
import { WrongChainBanner } from "@/components/WrongChainBanner";
import { ConnectButton } from "@/components/ConnectButton";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#08090E]">
      <Sidebar />
      <main className="ml-0 md:ml-[260px] min-h-screen">
        <WrongChainBanner />
        {/* Top-right floating connect-wallet, always visible across the dashboard */}
        <div className="fixed top-4 right-4 z-40 md:top-6 md:right-8">
          <ConnectButton />
        </div>
        <div className="py-8 px-6 pt-16 md:pt-8 md:px-10">{children}</div>
      </main>
    </div>
  );
}
