"use client";

import { Sidebar } from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#08090E]">
      <Sidebar />
      <main className="ml-[260px] min-h-screen">
        <div className="py-8 px-10">{children}</div>
      </main>
    </div>
  );
}
