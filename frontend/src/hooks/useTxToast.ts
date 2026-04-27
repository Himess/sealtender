"use client";

import { useEffect, useState, useCallback } from "react";

export type TxToast = { message: string; type: "success" | "error" };

/**
 * Surface a `useWriteContract` lifecycle as a toast.
 *
 * Pass the `error` from `useWriteContract` and the `isSuccess` from
 * `useWaitForTransactionReceipt` along with friendly success/error messages.
 * Returns the current toast and a dismisser. Designed to standardize the tx
 * feedback story across pages so users always know whether a tx errored,
 * succeeded, or is still pending.
 */
export function useTxToast(opts: {
  error: Error | null;
  isSuccess: boolean;
  successMessage: string;
  errorPrefix?: string;
}) {
  const { error, isSuccess, successMessage, errorPrefix } = opts;
  const [toast, setToast] = useState<TxToast | null>(null);

  useEffect(() => {
    if (isSuccess) setToast({ message: successMessage, type: "success" });
  }, [isSuccess, successMessage]);

  useEffect(() => {
    if (error) {
      const prefix = errorPrefix ? `${errorPrefix}: ` : "";
      setToast({
        message: `${prefix}${(error.message || String(error)).slice(0, 160)}`,
        type: "error",
      });
    }
  }, [error, errorPrefix]);

  const dismiss = useCallback(() => setToast(null), []);

  return { toast, setToast, dismiss };
}
