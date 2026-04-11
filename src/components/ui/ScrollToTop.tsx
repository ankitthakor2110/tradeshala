"use client";

import { useState, useEffect } from "react";
import { useIsMounted } from "@/hooks/useIsMounted";

interface ScrollToTopProps {
  label: string;
}

export default function ScrollToTop({ label }: ScrollToTopProps) {
  const mounted = useIsMounted();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!mounted) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`group fixed bottom-8 right-8 z-50 w-12 h-12 rounded-full bg-violet-500 hover:bg-violet-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/25 text-white shadow-lg shadow-violet-500/25 flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110 active:scale-95 ${
        visible
          ? "opacity-100 pointer-events-auto translate-y-0"
          : "opacity-0 pointer-events-none translate-y-4"
      }`}
      aria-label={label}
    >
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 15l7-7 7 7"
        />
      </svg>
      <span className="absolute bottom-full mb-2 px-3 py-1 text-xs text-white bg-gray-800 rounded-full whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {label}
      </span>
    </button>
  );
}
