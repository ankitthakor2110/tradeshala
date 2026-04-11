export function getPnLColor(value: number): string {
  if (value > 0) return "text-green-400";
  if (value < 0) return "text-red-400";
  return "text-gray-400";
}

export function getPnLBgColor(value: number): string {
  if (value > 0) return "bg-green-500/10 text-green-400 border border-green-500/20";
  if (value < 0) return "bg-red-500/10 text-red-400 border border-red-500/20";
  return "bg-gray-500/10 text-gray-400 border border-gray-500/20";
}

export function formatPnL(value: number, currency = "₹"): string {
  if (value > 0) return `+${currency}${value.toLocaleString("en-IN")}`;
  if (value < 0) return `-${currency}${Math.abs(value).toLocaleString("en-IN")}`;
  return `${currency}0`;
}
