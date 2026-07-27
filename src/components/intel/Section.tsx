"use client";

import { useState, type ReactNode } from "react";
import DataBadge from "./DataBadge";
import { CARD } from "./style";
import type { DataProvenance } from "@/types/intel";

interface SectionProps {
  title: string;
  provenance?: DataProvenance;
  right?: ReactNode;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  /** When true, the header toggles the body open/closed. Backward-compatible (default off). */
  collapsible?: boolean;
  defaultOpen?: boolean;
}

/** Standard card shell for every dashboard section: title + provenance badge. */
export default function Section({
  title,
  provenance,
  right,
  subtitle,
  children,
  className = "",
  collapsible = false,
  defaultOpen = true,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const showBody = !collapsible || open;

  return (
    <section className={`${CARD} p-4 sm:p-5 ${className}`}>
      <div className={`flex items-start justify-between gap-3 ${showBody ? "mb-4" : ""}`}>
        <button
          type="button"
          disabled={!collapsible}
          onClick={() => collapsible && setOpen((o) => !o)}
          aria-expanded={collapsible ? open : undefined}
          className={`flex items-start gap-2 text-left ${collapsible ? "cursor-pointer" : "cursor-default"}`}
        >
          {collapsible && (
            <span
              className={`mt-0.5 text-gray-500 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
              aria-hidden
            >
              ▸
            </span>
          )}
          <span>
            <h2 className="text-sm font-semibold text-white sm:text-base">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </span>
        </button>
        <div className="flex items-center gap-2">
          {right}
          {provenance && <DataBadge provenance={provenance} />}
        </div>
      </div>
      {showBody && children}
    </section>
  );
}
