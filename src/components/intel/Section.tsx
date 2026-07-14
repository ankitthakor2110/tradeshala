"use client";

import type { ReactNode } from "react";
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
}

/** Standard card shell for every dashboard section: title + provenance badge. */
export default function Section({ title, provenance, right, subtitle, children, className = "" }: SectionProps) {
  return (
    <section className={`${CARD} p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white sm:text-base">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {right}
          {provenance && <DataBadge provenance={provenance} />}
        </div>
      </div>
      {children}
    </section>
  );
}
