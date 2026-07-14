// Shared visual helpers for the Market Intelligence components. Keeps bias /
// tone / buildup → Tailwind-class mapping in one place so the palette is
// consistent (violet = UI, green = bullish, red = bearish, gray = neutral).

import type { Bias, InsightTone, OiBuildup } from "@/types/intel";

export const CARD = "bg-gray-900 border border-gray-800 rounded-xl";

export function biasLabel(bias: Bias): string {
  return {
    "strong-bullish": "Strong Bullish",
    bullish: "Bullish",
    neutral: "Neutral",
    bearish: "Bearish",
    "strong-bearish": "Strong Bearish",
  }[bias];
}

export function biasClasses(bias: Bias): { text: string; bg: string; bar: string } {
  switch (bias) {
    case "strong-bullish":
      return { text: "text-green-400", bg: "bg-green-500/15 border-green-500/30", bar: "bg-green-500" };
    case "bullish":
      return { text: "text-green-400", bg: "bg-green-500/10 border-green-500/20", bar: "bg-green-400" };
    case "bearish":
      return { text: "text-red-400", bg: "bg-red-500/10 border-red-500/20", bar: "bg-red-400" };
    case "strong-bearish":
      return { text: "text-red-400", bg: "bg-red-500/15 border-red-500/30", bar: "bg-red-500" };
    default:
      return { text: "text-gray-300", bg: "bg-gray-500/10 border-gray-500/20", bar: "bg-gray-500" };
  }
}

export function toneText(tone: InsightTone): string {
  return {
    bullish: "text-green-400",
    bearish: "text-red-400",
    warning: "text-amber-400",
    neutral: "text-gray-300",
  }[tone];
}

export function toneAccent(tone: InsightTone): string {
  return {
    bullish: "border-green-500/40 bg-green-500/5",
    bearish: "border-red-500/40 bg-red-500/5",
    warning: "border-amber-500/40 bg-amber-500/5",
    neutral: "border-gray-700 bg-gray-800/40",
  }[tone];
}

export function buildupClasses(b: OiBuildup): string {
  switch (b) {
    case "long-buildup":
    case "short-covering":
    case "fresh-put-writing":
    case "call-unwinding":
      return "text-green-400 bg-green-500/10";
    case "fresh-call-writing":
    case "put-unwinding":
      return "text-red-400 bg-red-500/10";
    default:
      return "text-gray-500";
  }
}
