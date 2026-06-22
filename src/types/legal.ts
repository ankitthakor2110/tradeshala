import type { ReactNode } from "react";

export interface LegalSection {
  title: string;
  content: string;
}

export interface LegalConfig {
  lastUpdated: string;
  sections: LegalSection[];
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  // "terminal" renders as a bottom-sheet on mobile but an inline, full-width
  // panel (no overlay) on desktop — used by the trade screen's terminal layout.
  size?: "default" | "terminal";
}
