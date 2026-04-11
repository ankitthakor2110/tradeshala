"use client";

import { useState, useEffect, useCallback } from "react";
import { useIsMounted } from "@/hooks/useIsMounted";

export type ToastType = "success" | "error" | "info";

interface ToastData {
  id: number;
  message: string;
  type: ToastType;
}

let toastId = 0;
let addToastFn: ((message: string, type: ToastType) => void) | null = null;

export function showToast(message: string, type: ToastType = "info") {
  addToastFn?.(message, type);
}

export default function ToastContainer() {
  const mounted = useIsMounted();
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => {
      addToastFn = null;
    };
  }, [addToast]);

  if (!mounted) return null;

  const typeStyles: Record<ToastType, string> = {
    success: "bg-green-500/10 border-green-500/30 text-green-400",
    error: "bg-red-500/10 border-red-500/30 text-red-400",
    info: "bg-violet-500/10 border-violet-500/30 text-violet-400",
  };

  const icons: Record<ToastType, string> = {
    success: "M5 13l4 4L19 7",
    error: "M6 18L18 6M6 6l12 12",
    info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  };

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto border rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg backdrop-blur-sm min-w-[280px] max-w-[400px] animate-[slideIn_200ms_ease-out] ${typeStyles[toast.type]}`}
        >
          <svg
            className="w-5 h-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={icons[toast.type]}
            />
          </svg>
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
      ))}
    </div>
  );
}
