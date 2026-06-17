/**
 * Upstox instrument keys for equities are ISIN-based (`NSE_EQ|<ISIN>`), NOT
 * symbol-based — `NSE_EQ|RELIANCE` returns empty. (Indices are the exception:
 * they use name keys like `NSE_INDEX|Nifty 50`.)
 *
 * This basket of liquid NIFTY constituents is used to COMPUTE top gainers/
 * losers, since Upstox exposes no top-movers REST endpoint. Each key was
 * verified to resolve against the Upstox full-quote API. The display symbol is
 * taken from the API response, so corporate renames (e.g. Tata Motors → TMPV)
 * surface automatically.
 */
export const MOVERS_BASKET: string[] = [
  "NSE_EQ|INE002A01018", // RELIANCE
  "NSE_EQ|INE467B01029", // TCS
  "NSE_EQ|INE040A01034", // HDFCBANK
  "NSE_EQ|INE009A01021", // INFY
  "NSE_EQ|INE090A01021", // ICICIBANK
  "NSE_EQ|INE030A01027", // HINDUNILVR
  "NSE_EQ|INE062A01020", // SBIN
  "NSE_EQ|INE397D01024", // BHARTIARTL
  "NSE_EQ|INE154A01025", // ITC
  "NSE_EQ|INE018A01030", // LT
  "NSE_EQ|INE238A01034", // AXISBANK
  "NSE_EQ|INE585B01010", // MARUTI
  "NSE_EQ|INE021A01026", // ASIANPAINT
  "NSE_EQ|INE075A01022", // WIPRO
  "NSE_EQ|INE155A01022", // TATAMOTORS (now trades as TMPV)
  "NSE_EQ|INE044A01036", // SUNPHARMA
  "NSE_EQ|INE860A01027", // HCLTECH
  "NSE_EQ|INE280A01028", // TITAN
];
