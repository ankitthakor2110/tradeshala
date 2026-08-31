// ============================================================================
// Market-session gate (spec section 32). Pure: given "HH:MM" minutes-of-day for
// the signal time and the configured window, decide if trading is allowed. The
// caller converts the signal timestamp to IST minutes-of-day before calling.
// ============================================================================

/** Parse "HH:MM" to minutes-of-day, or null if malformed. */
export function hhmmToMinutes(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** True when `minutesOfDay` is within [start, end] inclusive. */
export function withinSession(minutesOfDay: number, start: string, end: string): boolean {
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if (s == null || e == null) return true; // malformed window → don't block
  return minutesOfDay >= s && minutesOfDay <= e;
}

/** Minutes-of-day for a Date in a given IANA timezone. */
export function istMinutesOfDay(date: Date, timeZone = "Asia/Kolkata"): number {
  const ist = new Date(date.toLocaleString("en-US", { timeZone }));
  return ist.getHours() * 60 + ist.getMinutes();
}
