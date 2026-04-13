import { getIndices } from "@/lib/market-data";

export async function GET() {
  try {
    const { data, source } = await getIndices();

    if (source === "unavailable") {
      return Response.json(
        { nifty50: null, bankNifty: null, source, last_updated: new Date().toISOString() },
        { status: 503 }
      );
    }

    return Response.json({
      nifty50: data.nifty50,
      bankNifty: data.bankNifty,
      source,
      last_updated: new Date().toISOString(),
    });
  } catch {
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
