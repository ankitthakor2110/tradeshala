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
}
