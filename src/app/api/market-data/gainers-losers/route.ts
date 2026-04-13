import { getGainersLosers } from "@/lib/market-data";

export async function GET() {
  try {
    const { data, source } = await getGainersLosers();

    if (source === "unavailable") {
      return Response.json(
        { gainers: [], losers: [], source },
        { status: 503 }
      );
    }

    return Response.json({
      gainers: data.gainers,
      losers: data.losers,
      source,
    });
  } catch {
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
