import { NextRequest } from "next/server";
import { getQuote } from "@/lib/market-data";

export async function GET(request: NextRequest) {
  try {
    const symbol = request.nextUrl.searchParams.get("symbol");

    if (!symbol) {
      return Response.json({ error: "symbol is required" }, { status: 400 });
    }

    const { data, source } = await getQuote(symbol.toUpperCase());

    if (!data) {
      return Response.json(
        { error: "Unable to fetch market data", symbol, source },
        { status: 503 }
      );
    }

    return Response.json({ ...data, source });
  } catch {
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
