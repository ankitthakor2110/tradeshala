// Config for the TradingView webhook paper-trading integration. Engine knobs are
// read from server-only env (see .env.local.example); UI copy lives here too so
// strings stay out of components (config-driven UI pattern).
//
// NOTE: this module reads process.env and must only be imported by server code
// (the webhook route, the processor, server components). WEBHOOK_SECRET is read
// directly in the route — never put the secret in this exported object.

function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name: string): boolean {
  return (process.env[name] ?? "").trim().toLowerCase() === "true";
}

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const TV_WEBHOOK_CONFIG = {
  // --- P&L engine (directional points × lot, NOT real option premium) ---
  pointValue: envNum("POINT_VALUE", 65), // NIFTY lot
  costPerOrder: envNum("COST_PER_ORDER", 35), // INR per leg; charged on entry + exit

  // --- Behaviour ---
  // When an ENTRY arrives opposite to an open position: true = close it
  // (reason "reverse") then open the new one; false = ignore the new signal.
  allowReverse: envBool("ALLOW_REVERSE"),
  timezone: process.env.TIMEZONE ?? "Asia/Kolkata",

  // --- Trade-engine execution (optional) ---
  // When true, each signal ALSO places a paper order in the trade simulator (in
  // addition to the tv_* ledger): entry → BUY the ATM option (CALL for long, PUT
  // for short, or the payload's option_type) at the nearest expiry; exit → close
  // it. Off by default — the ledger always runs regardless of this flag.
  engineExecution: envBool("TV_ENGINE_EXECUTION"),
  // The simulator account these orders execute into (webhooks have no session).
  // Resolved to a user via profiles.email by the service role. Defaults to the
  // admin account when WEBHOOK_TRADE_USER_EMAIL is unset.
  tradeUserEmail:
    process.env.WEBHOOK_TRADE_USER_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    null,
  // Refuse engine execution when the option chain only resolves to MOCK prices
  // (live providers down / token expired) — so simulator fills are never booked
  // at fabricated premiums. Default ON; set TV_ENGINE_REQUIRE_LIVE=false to allow
  // mock fills (e.g. for offline testing).
  engineRequireLive:
    (process.env.TV_ENGINE_REQUIRE_LIVE ?? "true").trim().toLowerCase() !== "false",

  // --- Security ---
  // Optional IP allowlist. Empty = OFF (dev default). TradingView's published
  // webhook IPs: 52.89.214.238, 34.212.75.30, 52.32.178.7, 54.218.53.128.
  ipAllowlist: envList("IP_ALLOWLIST"),

  // --- Dedupe ---
  // Drop a repeat of the same signal (same id, or same hash of
  // strategy+event+symbol+price+time) seen within this window.
  dedupeWindowSeconds: 60,

  // --- Exit-reason inference ---
  // On exit, classify the fill: within tolerance of tp -> "tp", of sl -> "sl",
  // else "manual". Tolerance = max(price * pct, absMin).
  reasonTolerancePercent: 0.001, // 0.1%
  reasonToleranceMin: 0.05,
} as const;

// UI copy for the dashboard (Phase 2). Kept here so components render data only.
export const TV_DASHBOARD_COPY = {
  title: "TradingView Signals",
  subtitle: "Paper-trading ledger fed by TradingView strategy alerts",
  // Always-visible disclaimer: this is a directional proxy, not real options P&L.
  disclaimer:
    "Models index-DIRECTION P&L (points × lot − costs). NOT real option premium — no theta / IV / delta. Paper trading only; no broker orders are ever placed.",
  combinedKey: "__combined__",
  combinedLabel: "All strategies",
  openNote: "Awaiting exit signal — no live feed",
  resetLabel: "Reset paper account",
  resetConfirm: "Clear all open positions and closed trades? Webhook logs are kept.",
  emptyOpen: "No open positions.",
  emptyClosed: "No closed trades yet.",
  pollIntervalMs: 3000,
  labels: {
    strategy: "Strategy",
    side: "Side",
    symbol: "Symbol",
    entry: "Entry",
    exit: "Exit",
    sl: "SL",
    tp: "TP",
    qty: "Qty",
    openedAt: "Opened",
    closedAt: "Closed",
    net: "Net",
    reason: "Reason",
    trades: "Trades",
    winRate: "Win rate",
    profitFactor: "Profit factor",
    avgWin: "Avg win",
    avgLoss: "Avg loss",
    expectancy: "Expectancy / trade",
    netPnl: "Net P&L",
    maxDrawdown: "Max drawdown",
    equityCurve: "Equity curve (cumulative net P&L)",
  },
} as const;
