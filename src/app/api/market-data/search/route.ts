import { NextRequest } from "next/server";
import { search } from "@/lib/market-data";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q");

    if (!query || query.trim().length < 1) {
      return Response.json({ results: [], source: "unavailable" });
    }

    const { data, source } = await search(query.trim().toUpperCase());

    return Response.json({ results: data, source });
  } catch {
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
