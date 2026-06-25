import { NextRequest } from "next/server";
import { fetchOptionChain } from "@/lib/market-data/option-chain";

export async function GET(request: NextRequest) {
  try {
    const symbol = request.nextUrl.searchParams.get("symbol")?.toUpperCase();
    const expiry = request.nextUrl.searchParams.get("expiry");

    if (!symbol) return Response.json({ error: "symbol is required" }, { status: 400 });
    if (!expiry) return Response.json({ error: "expiry is required" }, { status: 400 });

    return Response.json(await fetchOptionChain(symbol, expiry));
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
