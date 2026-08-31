// Preflight guard for `npm run nse:deals`. Exit 0 = proceed, 1 = skip.
//
// Skips weekends (deterministic) and any date listed in nse-holidays.txt (next to
// this file). Evaluated in IST regardless of the machine timezone. Pass --force
// (or set NSE_FORCE=1) to bypass the guard for a manual run.
//
// Used by `npm run nse:deals:guarded` and the local scheduled task; keep the
// holiday list in scripts/nse-holidays.txt up to date against the official NSE
// calendar (https://www.nseindia.com/resources/exchange-communication-holidays).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HOLIDAYS_FILE = fileURLToPath(new URL("./nse-holidays.txt", import.meta.url));

if (process.argv.includes("--force") || process.env.NSE_FORCE === "1") {
  console.log("guard: PROCEED (forced)");
  process.exit(0);
}

const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
const dow = ist.getDay(); // 0 = Sunday, 6 = Saturday
const today = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;

if (dow === 0 || dow === 6) {
  console.log(`guard: SKIP - weekend (${today})`);
  process.exit(1);
}

const holidays = new Set();
if (existsSync(HOLIDAYS_FILE)) {
  for (const line of readFileSync(HOLIDAYS_FILE, "utf8").split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const date = s.split(/\s+/)[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) holidays.add(date);
  }
}

if (holidays.has(today)) {
  console.log(`guard: SKIP - NSE holiday (${today})`);
  process.exit(1);
}

console.log(`guard: PROCEED (${today})`);
process.exit(0);
