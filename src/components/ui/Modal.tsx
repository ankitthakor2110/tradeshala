"use client";

import { useEffect, useCallback } from "react";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import type { ModalProps } from "@/types/legal";

export default function Modal({ isOpen, onClose, title, children, size = "default" }: ModalProps) {
  const isTerminal = size === "terminal";

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // The terminal variant is inline on desktop, so only lock body scroll
      // when it's actually an overlay (mobile, or the default modal).
      const isOverlay = !isTerminal || (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches);
      if (isOverlay) document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown, isTerminal]);

  if (!isOpen) return null;

  // Terminal: bottom-sheet overlay on mobile, inline full-width panel on desktop.
  if (isTerminal) {
    return (
      <>
        {/* Backdrop — mobile only */}
        <div className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm animate-[fadeIn_200ms_ease-out]" onClick={onClose} />
        <div
          className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] rounded-t-2xl flex flex-col animate-[slideUp_200ms_ease-out] bg-gray-900 border border-gray-800 lg:static lg:z-auto lg:max-h-none lg:rounded-2xl lg:animate-none lg:border"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 lg:px-5 py-3 border-b border-gray-800 shrink-0">
            <h2 className="text-base lg:text-lg font-semibold text-white">{title}</h2>
            <button onClick={onClose} className={`${INTERACTION_CLASSES.iconButton} text-gray-400 hover:text-white`} aria-label="Close">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto lg:overflow-visible p-4 lg:p-5">{children}</div>
        </div>
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 animate-[fadeIn_200ms_ease-out]"
      onClick={onClose}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] bg-gray-900 border border-gray-800 rounded-t-2xl sm:rounded-xl flex flex-col animate-[slideUp_200ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-800 shrink-0">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className={`${INTERACTION_CLASSES.iconButton} text-gray-400 hover:text-white`}
            aria-label="Close"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
