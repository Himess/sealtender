"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4 max-w-md">
        <div className="w-12 h-12 rounded-lg bg-[#FF4444]/10 border border-[#FF4444]/20 flex items-center justify-center mx-auto">
          <AlertTriangle size={24} className="text-[#FF4444]" />
        </div>
        <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
          Something went wrong
        </h2>
        <p className="font-body text-[14px] text-[#888888]">
          {error.message || "An unexpected error occurred while loading this page."}
        </p>
        {error.digest && (
          <p className="font-body text-[12px] text-[#555555] font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-[10px] bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-[10px] bg-[#0D0F14] border border-[#1E2230] text-[#888888] rounded-[6px] text-sm hover:border-[#00E87B]/30 transition-colors"
          >
            <Home size={16} />
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
