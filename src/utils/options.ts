// Option pricing & probability helpers for payoff/POP visualisations.
// These power the "today" (T+0) curve and Probability-of-Profit readouts that
// the expiry payoff alone can't show. All IVs are fractions (0.12 = 12%).

const DEFAULT_RISK_FREE = 0.065; // ~India 1y T-bill; model input, not user copy.

/** Standard normal CDF (Abramowitz & Stegun 7.1.26). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** Years until expiry (date-only ISO). Floors at a small positive to avoid /0. */
export function yearsToExpiry(expiry: string | null): number {
  if (!expiry) return 0;
  const d = new Date(`${expiry}T15:30:00`).getTime(); // ~market close on expiry
  const ms = d - Date.now();
  return Math.max(ms / (365 * 24 * 60 * 60 * 1000), 0.5 / 365); // >= ~half a day
}

/**
 * Black–Scholes premium for a European option. `iv` is a fraction. At/near
 * expiry (T→0 or iv→0) it collapses to intrinsic value.
 */
export function bsPrice(
  type: "CE" | "PE",
  S: number,
  K: number,
  T: number,
  iv: number,
  r: number = DEFAULT_RISK_FREE
): number {
  if (S <= 0 || K <= 0) return 0;
  if (T <= 0 || iv <= 0) {
    return type === "CE" ? Math.max(0, S - K) : Math.max(0, K - S);
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (iv * iv) / 2) * T) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  if (type === "CE") {
    return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  }
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

/**
 * Probability that a position/strategy is profitable at expiry, by integrating
 * a lognormal distribution of the underlying over the regions where the supplied
 * expiry-payoff function is positive. `sigma` is the (ATM) IV fraction.
 * Returns a percentage (0–100).
 */
export function probOfProfit(
  payoffAtExpiry: (s: number) => number,
  S0: number,
  sigma: number,
  T: number
): number {
  if (S0 <= 0 || sigma <= 0 || T <= 0) return 0;
  const sigT = sigma * Math.sqrt(T);
  const mu = Math.log(S0) - (sigT * sigT) / 2; // zero-drift lognormal
  // Cover ~±5σ so essentially all probability mass is captured.
  const lo = S0 * Math.exp(-5 * sigT);
  const hi = S0 * Math.exp(5 * sigT);
  const steps = 600;
  const dx = (hi - lo) / steps;
  let mass = 0;
  let profit = 0;
  for (let i = 0; i < steps; i++) {
    const s = lo + (i + 0.5) * dx;
    const pdf = (1 / (s * sigT * Math.sqrt(2 * Math.PI))) * Math.exp(-((Math.log(s) - mu) ** 2) / (2 * sigT * sigT));
    const w = pdf * dx;
    mass += w;
    if (payoffAtExpiry(s) > 0) profit += w;
  }
  return mass > 0 ? (profit / mass) * 100 : 0;
}
