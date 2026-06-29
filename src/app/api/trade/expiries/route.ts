import { NextRequest } from "next/server";
import { getExpiries } from "@/lib/market-data/expiries";

export async function GET(request: NextRequest) {
  try {
    const symbol = request.nextUrl.searchParams.get("symbol")?.toUpperCase();

    if (!symbol) {
      return Response.json({ error: "symbol is required" }, { status: 400 });
    }

    const { expiries, source } = await getExpiries(symbol);
    return Response.json({ expiries, source });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
