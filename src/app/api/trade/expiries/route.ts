import { NextRequest } from "next/server";

function getNextThursday(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay();
  const daysUntilThursday = (4 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilThursday);
  return d;
}

function getLastThursdayOfMonth(year: number, month: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const day = lastDay.getDay();
  const diff = (day - 4 + 7) % 7;
  lastDay.setDate(lastDay.getDate() - diff);
  return lastDay;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function generateWeeklyExpiries(from: Date, count: number): string[] {
  const expiries: string[] = [];
  let current = getNextThursday(from);

  for (let i = 0; i < count; i++) {
    expiries.push(formatDate(current));
    current = new Date(current);
    current.setDate(current.getDate() + 7);
  }

  return expiries;
}

function generateMonthlyExpiries(from: Date, count: number): string[] {
  const expiries: string[] = [];
  let year = from.getFullYear();
  let month = from.getMonth();

  for (let i = 0; i < count; i++) {
    const lastThurs = getLastThursdayOfMonth(year, month);
    if (lastThurs >= from) {
      expiries.push(formatDate(lastThurs));
    }
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
    if (expiries.length < count) {
      const next = getLastThursdayOfMonth(year, month);
      if (!expiries.includes(formatDate(next))) {
        expiries.push(formatDate(next));
      }
    }
  }

  return expiries.slice(0, count);
}

async function fetchDhanExpiries(symbol: string): Promise<string[] | null> {
  const token = process.env.DHAN_ACCESS_TOKEN;
  const clientId = process.env.DHAN_CLIENT_ID;
  if (!token || !clientId || token.startsWith("your_")) return null;

  try {
    const res = await fetch(
      `https://api.dhan.co/v2/optionchain/expiry?symbol=${encodeURIComponent(symbol)}`,
      {
        headers: {
          "access-token": token,
          "client-id": clientId,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const expiries: string[] = data?.data ?? [];
    return expiries.length > 0 ? expiries : null;
  } catch {
    return null;
  }
}

async function fetchUpstoxExpiries(symbol: string): Promise<string[] | null> {
  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token || token.startsWith("your_")) return null;

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

    if (!res.ok) return null;
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

    // Generate mock expiries
    const now = new Date();
    const weekly = generateWeeklyExpiries(now, 4);
    const monthly = generateMonthlyExpiries(now, 3);

    // Merge and deduplicate
    const all = [...new Set([...weekly, ...monthly])].sort();

    return Response.json({ expiries: all, source: "mock" });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
