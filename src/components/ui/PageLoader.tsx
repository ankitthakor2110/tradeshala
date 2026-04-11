"use client";

import { useLoading } from "@/context/LoadingContext";

export default function PageLoader() {
  const { isLoading, loadingText } = useLoading();

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-gray-950/80 flex flex-col items-center justify-center">
      <div className="w-12 h-12 border-4 border-gray-700 border-t-violet-400 rounded-full animate-spin" />
      {loadingText && (
        <p className="mt-4 text-sm text-gray-400">{loadingText}</p>
      )}
    </div>
  );
}
