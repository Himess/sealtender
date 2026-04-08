"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

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
        <div className="w-12 h-12 rounded-xl bg-[#FF4444]/10 border border-[#FF4444]/20 flex items-center justify-center mx-auto">
          <AlertTriangle size={24} className="text-[#FF4444]" />
        </div>
        <h2 className="text-xl font-heading font-semibold text-[#F0F2F5]">
          Something went wrong
        </h2>
        <p className="text-sm text-[#A0A8B8]">
          {error.message || "An unexpected error occurred while loading this page."}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#00E87B] text-[#08090E] rounded-lg font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
        >
          <RefreshCw size={16} />
          Try Again
        </button>
      </div>
    </div>
  );
}
