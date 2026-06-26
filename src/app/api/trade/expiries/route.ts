import { NextRequest } from "next/server";
import { DHAN_UNDERLYING } from "@/lib/market-data/option-chain";
import { getSharedUpstoxToken } from "@/lib/market-data/upstox";

// Expiry weekday after SEBI's 2025 realignment: NSE index options expire on
// Tuesday, BSE Sensex on Thursday. (JS getUTCDay: Sun=0 … Tue=2, Thu=4.)
const EXPIRY_WEEKDAY: Record<string, number> = { NSE: 2, BSE: 4 };
// Only NIFTY (NSE) and SENSEX (BSE) still list weekly options. BANKNIFTY and
// FINNIFTY became monthly-only after the Nov-2024 weekly-options rationalisation.
const WEEKLY_SYMBOLS = new Set(["NIFTY", "SENSEX"]);

// "Today" pinned to IST and rebuilt in UTC, so all weekday math below is stable
// regardless of where the server runs. Holiday roll-back (expiry → previous
// trading day) is not modeled here — live providers give the authoritative
// dates; this generator is only the offline fallback.
function todayIST(): Date {
  const [y, m, d] = new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .split("-")
    .map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// First occurrence of `weekday` on or after `from`.
function nextWeekday(from: Date, weekday: number): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + ((weekday - d.getUTCDay() + 7) % 7));
  return d;
}

// Last `weekday` of the given month (month is 0-based).
function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const d = new Date(Date.UTC(year, month + 1, 0)); // last calendar day of month
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - weekday + 7) % 7));
  return d;
}

function generateWeeklyExpiries(from: Date, weekday: number, count: number): string[] {
  const expiries: string[] = [];
  let current = nextWeekday(from, weekday);

  for (let i = 0; i < count; i++) {
    expiries.push(formatDate(current));
    current = new Date(current);
    current.setUTCDate(current.getUTCDate() + 7);
  }

  return expiries;
}

function generateMonthlyExpiries(from: Date, weekday: number, count: number): string[] {
  const expiries: string[] = [];
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();

  while (expiries.length < count) {
    const last = lastWeekdayOfMonth(year, month, weekday);
    if (last >= from) expiries.push(formatDate(last));
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }

  return expiries;
}

async function fetchDhanExpiries(symbol: string): Promise<string[] | null> {
  const token = process.env.DHAN_ACCESS_TOKEN;
  const clientId = process.env.DHAN_CLIENT_ID;
  const underlying = DHAN_UNDERLYING[symbol];
  if (!token || !clientId || token.startsWith("your_") || !underlying) return null;

  try {
    const res = await fetch("https://api.dhan.co/v2/optionchain/expirylist", {
      method: "POST",
      headers: {
        "access-token": token,
        "client-id": clientId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        UnderlyingScrip: underlying.scrip,
        UnderlyingSeg: underlying.seg,
      }),
    });

    if (!res.ok) {
      console.warn(`[expiries] Dhan ${symbol}: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const expiries: string[] = data?.data ?? [];
    return expiries.length > 0 ? expiries : null;
  } catch (e) {
    console.warn(`[expiries] Dhan ${symbol} fetch failed:`, e);
    return null;
  }
}

async function fetchUpstoxExpiries(symbol: string): Promise<string[] | null> {
  const token = await getSharedUpstoxToken();
  if (!token) return null;

  const instrumentMap: Record<string, string> = {
    NIFTY: "NSE_INDEX|Nifty 50",
    BANKNIFTY: "NSE_INDEX|Nifty Bank",
    FINNIFTY: "NSE_INDEX|Nifty Fin Service",
    SENSEX: "BSE_INDEX|SENSEX",
  };

  const instrumentKey = instrumentMap[symbol];
  if (!instrumentKey) return null;

  try {
    const res = await fetch(
      `https://api.upstox.com/v2/option/contract?instrument_key=${encodeURIComponent(instrumentKey)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      console.warn(`[expiries] Upstox ${symbol}: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const contracts = data?.data as Record<string, unknown>[] | undefined;
    if (!contracts) return null;

    const dates = [
      ...new Set(
        contracts
          .map((c) => c.expiry as string)
          .filter(Boolean)
          .sort()
      ),
    ];

    return dates.length > 0 ? dates : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const symbol = request.nextUrl.searchParams.get("symbol")?.toUpperCase();

    if (!symbol) {
      return Response.json({ error: "symbol is required" }, { status: 400 });
    }

    // Try live providers
    const dhanExpiries = await fetchDhanExpiries(symbol);
    if (dhanExpiries) {
      return Response.json({ expiries: dhanExpiries, source: "dhan" });
    }

    const upstoxExpiries = await fetchUpstoxExpiries(symbol);
    if (upstoxExpiries) {
      return Response.json({ expiries: upstoxExpiries, source: "upstox" });
    }

    // Generate mock expiries on the correct weekday for this underlying's
    // exchange. Weeklies only for symbols that still list them.
    const exchange = symbol === "SENSEX" ? "BSE" : "NSE";
    const weekday = EXPIRY_WEEKDAY[exchange];
    const now = todayIST();
    const weekly = WEEKLY_SYMBOLS.has(symbol)
      ? generateWeeklyExpiries(now, weekday, 4)
      : [];
    const monthly = generateMonthlyExpiries(now, weekday, 3);

    // Merge and deduplicate
    const all = [...new Set([...weekly, ...monthly])].sort();

    return Response.json({ expiries: all, source: "mock" });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
