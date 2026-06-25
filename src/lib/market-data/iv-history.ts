import { createAdminClient } from "@/lib/supabase/admin";
import { fetchOptionChain } from "@/lib/market-data/option-chain";

// Daily IV / OI / PCR / max-pain snapshot per option underlying, so the app can
// compute IV Rank / IV Percentile and draw IV-and-OI-over-time. Written by the
// snapshot cron (one row per symbol+expiry+day, upserted).

type Admin = ReturnType<typeof createAdminClient>;

const IV_HISTORY_SYMBOLS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"];

// Nearest weekly (Thursday) expiry, the contract this app keys on.
function nearestThursday(): string {
  const d = new Date();
  const add = (4 - d.getDay() + 7) % 7; // 0 when today is Thursday
  d.setDate(d.getDate() + add);
  return d.toISOString().split("T")[0];
}

function istDate(): string {
  // en-CA renders YYYY-MM-DD; pin to IST so the trading day is correct.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export async function recordIvHistoryOnce(admin: Admin): Promise<number> {
  const expiry = nearestThursday();
  const capturedOn = istDate();
  const rows: Record<string, unknown>[] = [];

  for (const symbol of IV_HISTORY_SYMBOLS) {
    try {
      const { chain, underlyingPrice, atmStrike } = await fetchOptionChain(symbol, expiry);
      if (chain.length === 0) continue;
      const totalCeOi = chain.reduce((s, r) => s + r.ce.oi, 0);
      const totalPeOi = chain.reduce((s, r) => s + r.pe.oi, 0);
      const atmRow = chain.find((r) => r.strike_price === atmStrike);
      const atmIv = atmRow ? (atmRow.ce.iv + atmRow.pe.iv) / 2 : 0;
      const maxPain = chain.reduce((a, b) => (a.ce.oi + a.pe.oi >= b.ce.oi + b.pe.oi ? a : b)).strike_price;
      rows.push({
        symbol,
        expiry,
        captured_on: capturedOn,
        atm_iv: Math.round(atmIv * 100) / 100,
        pcr: totalCeOi > 0 ? Math.round((totalPeOi / totalCeOi) * 100) / 100 : 0,
        total_ce_oi: totalCeOi,
        total_pe_oi: totalPeOi,
        max_pain: maxPain,
        underlying: underlyingPrice,
      });
    } catch {
      continue;
    }
  }

  if (rows.length === 0) return 0;
  const { error } = await admin
    .from("iv_history")
    .upsert(rows as never, { onConflict: "symbol,expiry,captured_on" });
  if (error) throw new Error(`iv_history upsert failed: ${error.message}`);
  return rows.length;
}
