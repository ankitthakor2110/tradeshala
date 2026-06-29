"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useIsMounted } from "@/hooks/useIsMounted";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useLiveOptionQuotes } from "@/hooks/useLiveOptionQuotes";
import { useSnapshotPoller } from "@/hooks/useSnapshotPoller";
import { getCurrentUser } from "@/services/auth.service";
import { searchStocks, getStockQuote, getIndicesData, getCandles, getOptionLtp, getIvHistory, type Candle, type IvHistoryPoint } from "@/services/market-data.service";
import { TRADE_CONFIG } from "@/config/trade";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import { getPnLColor } from "@/utils/colors";
import { formatOI, formatPercent } from "@/utils/format";
import {
  ComposedChart,
  AreaChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import LiveBadge from "@/components/ui/LiveBadge";
import Modal from "@/components/ui/Modal";
import { showToast } from "@/components/ui/Toast";
import { simulateFill, placeOrder } from "@/services/trade-engine.service";
import { getRecentContracts, type RecentContract } from "@/services/positions.service";
import { bsPrice, probOfProfit, yearsToExpiry, yearsBetween } from "@/utils/options";
import type { MarketData, OptionChainData, OrderFormData } from "@/types/database";

const INR = "\u20B9";

const STRIKE_GAP: Record<string, number> = { NIFTY: 50, BANKNIFTY: 100, FINNIFTY: 50, SENSEX: 100 };

function calcAtm(price: number, symbol: string): number {
  const gap = STRIKE_GAP[symbol] ?? 5;
  return Math.round(price / gap) * gap;
}

function filterStrikes(chain: OptionChainData[], atm: number, symbol: string, range: number): OptionChainData[] {
  const gap = STRIKE_GAP[symbol] ?? 5;
  const strikes: number[] = [];
  for (let i = -range; i <= range; i++) strikes.push(atm + i * gap);
  return chain.filter((r) => strikes.includes(r.strike_price)).sort((a, b) => a.strike_price - b.strike_price);
}

// Moneyness of a strike for a given option side, relative to the ATM strike.
// CE is ITM below ATM (strike < spot); PE is ITM above ATM.
function moneyness(strike: number, atm: number, side: "CE" | "PE"): "ITM" | "ATM" | "OTM" {
  if (strike === atm) return "ATM";
  if (side === "CE") return strike < atm ? "ITM" : "OTM";
  return strike > atm ? "ITM" : "OTM";
}

// Indian-market OI build-up read from price move × OI move on a single leg.
// Returns null when the provider didn't supply OI-change (real feeds leave it 0).
function classifyBuildup(changePercent: number, oiChange: number): keyof typeof TRADE_CONFIG.buildup | null {
  if (!oiChange || !changePercent) return null;
  const priceUp = changePercent > 0;
  const oiUp = oiChange > 0;
  if (priceUp && oiUp) return "longBuildup";
  if (!priceUp && oiUp) return "shortBuildup";
  if (priceUp && !oiUp) return "shortCovering";
  return "longUnwinding";
}

interface SearchResult { symbol: string; company_name: string; exchange: string }
interface FavOption { symbol: string; exchange: string; name: string; side: "CE" | "PE"; strike: number; expiry: string | null }
const FAV_KEY = "ts_fav_options";
const favKey = (f: { symbol: string; side: "CE" | "PE"; strike: number; expiry: string | null }) =>
  `${f.symbol}|${f.side}|${f.strike}|${f.expiry ?? ""}`;
type InstrumentType = "EQ" | "CE" | "PE";
type TradeType = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT" | "SL" | "SL-M";

export default function TradePage() {
  const mounted = useIsMounted();
  const placeOrderRef = useRef<HTMLDivElement>(null);
  const placeActionRef = useRef<() => void>(() => {});

  const [userId, setUserId] = useState("");
  const [virtualCash, setVirtualCash] = useState(1000000);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [nifty, setNifty] = useState<MarketData | null>(null);
  const [bankNifty, setBankNifty] = useState<MarketData | null>(null);
  const [sensex, setSensex] = useState<MarketData | null>(null);
  const [indicesSource, setIndicesSource] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [tradeMode, setTradeMode] = useState<"single" | "strategy">("single");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [selectedExchange, setSelectedExchange] = useState("NSE");
  const [quote, setQuote] = useState<MarketData | null>(null);

  const [instrumentType, setInstrumentType] = useState<InstrumentType>("CE");
  const [expiries, setExpiries] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);
  const [fullChain, setFullChain] = useState<OptionChainData[]>([]);
  // Full chains cached per expiry — powers multi-expiry (calendar) strategies.
  const [chainsByExpiry, setChainsByExpiry] = useState<Record<string, OptionChainData[]>>({});
  const [chainLoading, setChainLoading] = useState(false);
  const [atmStrike, setAtmStrike] = useState(0);
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [selectedOptionLtp, setSelectedOptionLtp] = useState<number | null>(null);
  const [selectedSide, setSelectedSide] = useState<"CE" | "PE">("CE");
  const [flashStrike, setFlashStrike] = useState<number | null>(null);
  const [visibleCols, setVisibleCols] = useState({ oi: true, oiChg: false, vol: false, iv: true, delta: false, gamma: false, theta: false, vega: false, bidAsk: false });
  const [showColMenu, setShowColMenu] = useState(false);
  const [strikeRange, setStrikeRange] = useState<number>(TRADE_CONFIG.strikeWindow.initial);
  const [moneyFilter, setMoneyFilter] = useState<"all" | "ITM" | "OTM">("all");
  const [recentContracts, setRecentContracts] = useState<RecentContract[]>([]);
  const [favorites, setFavorites] = useState<FavOption[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candleInterval, setCandleInterval] = useState<"1minute" | "30minute">("30minute");
  const [candleSource, setCandleSource] = useState<string>("");
  const [showChart, setShowChart] = useState(true);
  const [showSkew, setShowSkew] = useState(false);
  const [showIvHistory, setShowIvHistory] = useState(false);
  const [ivHistory, setIvHistory] = useState<IvHistoryPoint[]>([]);
  const [premiumTicks, setPremiumTicks] = useState<{ t: number; p: number }[]>([]);

  const [tradeType, setTradeType] = useState<TradeType>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [orderQty, setOrderQty] = useState(1);
  const [orderPrice, setOrderPrice] = useState("");
  const [orderTrigger, setOrderTrigger] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [riskAmount, setRiskAmount] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{ msg: string; detail: string } | null>(null);

  // Load the persisted fast-mode preference (client-only).
  useEffect(() => {
    setFastMode(localStorage.getItem("ts_fast_mode") === "1");
  }, []);

  useEffect(() => {
    getCurrentUser().then(async (user) => {
      if (!user) return;
      setUserId(user.id);
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("virtual_balance").eq("id", user.id).single<{ virtual_balance: number }>();
      if (data) setVirtualCash(data.virtual_balance);
    });
    getIndicesData().then((res) => { if (res) { setNifty(res.nifty50); setBankNifty(res.bankNifty); setSensex(res.sensex ?? null); setIndicesSource(res.source ?? null); } });
  }, []);

  // Live prices over Supabase Realtime: the index tickers always, plus the
  // selected equity while it's being traded.
  const liveSymbols = useMemo(() => {
    const arr = ["NIFTY 50", "BANK NIFTY", "SENSEX"];
    if (selectedSymbol && instrumentType === "EQ") arr.push(selectedSymbol);
    return arr;
  }, [selectedSymbol, instrumentType]);
  const { quotes: live } = useLiveQuotes(liveSymbols);
  // Drive the shared snapshot writer while this page is open so live_quotes stays
  // fresh and Realtime fans the updates back here. The hook self-pauses when the
  // tab is hidden or the market is closed, and the server throttles concurrent
  // triggers — so this is one collapsed provider call per window, not per tab.
  useSnapshotPoller();

  useEffect(() => {
    const n = live["NIFTY 50"];
    const b = live["BANK NIFTY"];
    const s = live["SENSEX"];
    if (n) setNifty((prev) => (prev ? { ...prev, last_price: n.ltp, change: n.change, change_percent: n.change_percent } : prev));
    if (b) setBankNifty((prev) => (prev ? { ...prev, last_price: b.ltp, change: b.change, change_percent: b.change_percent } : prev));
    if (s) setSensex((prev) => (prev ? { ...prev, last_price: s.ltp, change: s.change, change_percent: s.change_percent } : prev));
    if (n || b || s) setIndicesSource("upstox");
  }, [live]);

  useEffect(() => {
    const q = live[selectedSymbol];
    if (!q) return;
    setQuote((prev) => (prev ? { ...prev, last_price: q.ltp, change: q.change, change_percent: q.change_percent } : prev));
  }, [live, selectedSymbol]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => { const res = await searchStocks(query); setResults(res); setSearching(false); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const fetchQuote = useCallback(async (symbol: string, exchange: string) => {
    const q = await getStockQuote(symbol, exchange);
    if (q) setQuote(q);
  }, []);

  useEffect(() => {
    if (!modalOpen || instrumentType === "EQ") { setExpiries([]); setSelectedExpiry(null); setFullChain([]); setSelectedStrike(null); setSelectedOptionLtp(null); return; }
    fetch(`/api/trade/expiries?symbol=${encodeURIComponent(selectedSymbol)}`).then((r) => r.json()).then((d) => { const l: string[] = d.expiries ?? []; setExpiries(l); if (l.length) setSelectedExpiry(l[0]); }).catch(() => setExpiries([]));
  }, [modalOpen, selectedSymbol, instrumentType]);

  useEffect(() => {
    if (!selectedSymbol || !selectedExpiry || instrumentType === "EQ") return;
    setChainLoading(true);
    fetch(`/api/trade/option-chain?symbol=${encodeURIComponent(selectedSymbol)}&expiry=${encodeURIComponent(selectedExpiry)}`)
      .then((r) => r.json())
      .then((d) => {
        const incoming: OptionChainData[] = d.chain ?? [];
        const underlying = d.underlyingPrice ?? quote?.last_price ?? 0;
        const atm = calcAtm(underlying, selectedSymbol);
        setAtmStrike(atm);
        setFullChain(incoming);
        if (selectedExpiry) setChainsByExpiry((prev) => ({ ...prev, [selectedExpiry]: incoming }));
        // Smart default: preselect the ATM strike when nothing is chosen yet.
        if (selectedStrike === null) {
          const atmRow = incoming.find((r) => r.strike_price === atm);
          if (atmRow) {
            const side = instrumentType === "PE" ? "PE" : "CE";
            setSelectedStrike(atm);
            setSelectedSide(side);
            setSelectedOptionLtp(side === "PE" ? atmRow.pe.ltp : atmRow.ce.ltp);
          }
        }
        setChainLoading(false);
      })
      .catch(() => { setFullChain([]); setChainLoading(false); });
    // selectedStrike is read only to auto-select once; re-running on it would
    // refetch the chain on every strike click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol, selectedExpiry, instrumentType, quote?.last_price]);

  // Underlying price chart for the ticket. Refetches on symbol/interval change
  // and once when the live quote first arrives (so the mock anchors to price).
  useEffect(() => {
    if (!modalOpen || !selectedSymbol || !showChart) { setCandles([]); return; }
    let cancelled = false;
    getCandles(selectedSymbol, candleInterval, quote?.last_price ?? 0).then((res) => {
      if (cancelled) return;
      setCandles(res.candles);
      setCandleSource(res.source);
    });
    return () => { cancelled = true; };
    // Re-anchor once when the quote becomes available; ignore subsequent ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, selectedSymbol, candleInterval, showChart, (quote?.last_price ?? 0) > 0]);

  // Premium movement: poll the selected contract's LTP every 5s and accumulate a
  // session sparkline (option premiums aren't on the Realtime feed, so we poll).
  useEffect(() => {
    if (!modalOpen || selectedStrike == null || !selectedExpiry) { setPremiumTicks([]); return; }
    let cancelled = false;
    setPremiumTicks(selectedOptionLtp != null ? [{ t: Date.now(), p: selectedOptionLtp }] : []);
    const poll = async () => {
      const ltp = await getOptionLtp(selectedSymbol, selectedExpiry, selectedStrike, selectedSide);
      if (cancelled || ltp == null) return;
      setPremiumTicks((prev) => [...prev, { t: Date.now(), p: ltp }].slice(-60));
    };
    const id = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed LTP read once on contract change
  }, [modalOpen, selectedSymbol, selectedExpiry, selectedStrike, selectedSide]);

  // IV/OI history for the underlying (IV Rank/Percentile + over-time chart).
  useEffect(() => {
    if (!modalOpen || !selectedSymbol || instrumentType === "EQ") { setIvHistory([]); return; }
    let cancelled = false;
    getIvHistory(selectedSymbol).then((h) => { if (!cancelled) setIvHistory(h); });
    return () => { cancelled = true; };
  }, [modalOpen, selectedSymbol, instrumentType]);

  function openTradeModal(symbol: string, name: string, exchange: string, side: "CE" | "PE" = "CE") {
    setSelectedSymbol(symbol); setSelectedName(name); setSelectedExchange(exchange);
    setInstrumentType(side); setTradeType("BUY"); setOrderType("MARKET"); setOrderQty(1);
    setOrderPrice(""); setOrderTrigger(""); setOrderNotes(""); setShowNotes(false);
    setSlPrice(""); setTargetPrice(""); setRiskAmount(""); setTradeMode("single");
    setConfirmStep(false); setOrderSuccess(null); setQuote(null);
    setSelectedStrike(null); setSelectedOptionLtp(null); setSelectedSide(side); setFlashStrike(null);
    setStrikeRange(TRADE_CONFIG.strikeWindow.initial); setMoneyFilter("all");
    setChainsByExpiry({}); // drop cached chains from the previous underlying
    setModalOpen(true); fetchQuote(symbol, exchange);
  }

  // Lazily fetch + cache the full chain for another expiry (calendar legs).
  const loadChainFor = useCallback(async (expiry: string) => {
    if (!selectedSymbol || chainsByExpiry[expiry]) return;
    try {
      const r = await fetch(`/api/trade/option-chain?symbol=${encodeURIComponent(selectedSymbol)}&expiry=${encodeURIComponent(expiry)}`);
      const d = await r.json();
      setChainsByExpiry((prev) => ({ ...prev, [expiry]: d.chain ?? [] }));
    } catch { /* ignore */ }
  }, [selectedSymbol, chainsByExpiry]);

  // Re-enter a recently traded contract: open the ticket on the same symbol/side.
  // Strike defaults to ATM (the chain re-resolves live), so this is a fast path
  // back to the instrument, not an exact-fill restore.
  function openFromRecent(rc: RecentContract) {
    const side: "CE" | "PE" = rc.option_type === "PE" ? "PE" : "CE";
    openTradeModal(rc.symbol, rc.company_name ?? rc.symbol, rc.exchange, side);
  }

  // Move the selection to the adjacent strike on the same side (◄ / ► stepper).
  function shiftStrike(dir: -1 | 1) {
    if (selectedStrike == null) return;
    const sorted = chain.map((r) => r.strike_price);
    const idx = sorted.indexOf(selectedStrike);
    if (idx < 0) return;
    const next = sorted[idx + dir];
    if (next == null) {
      // Reached the edge of the visible window — widen it if we can.
      if (canShowMore) setStrikeRange((r) => Math.min(TRADE_CONFIG.strikeWindow.max, r + TRADE_CONFIG.strikeWindow.step));
      return;
    }
    const row = chain.find((r) => r.strike_price === next);
    if (!row) return;
    handleStrikeSelect(next, selectedSide === "PE" ? row.pe.ltp : row.ce.ltp, selectedSide);
  }

  function handleStrikeSelect(strike: number, ltp: number, side: "CE" | "PE") {
    setSelectedStrike(strike); setSelectedOptionLtp(ltp); setInstrumentType(side); setSelectedSide(side);
    setSlPrice(""); setTargetPrice("");
    setFlashStrike(strike);
    setTimeout(() => setFlashStrike(null), 300);
    setTimeout(() => placeOrderRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 200);
  }

  // Visible window of strikes around ATM (widened by "Show more strikes"). The
  // strategy builder and metrics read this; the table additionally applies the
  // moneyness filter below.
  const chain = useMemo(
    () => filterStrikes(fullChain, atmStrike, selectedSymbol, strikeRange),
    [fullChain, atmStrike, selectedSymbol, strikeRange]
  );

  // Live option streaming: register the visible window's contracts so the
  // WebSocket worker subscribes to them, then overlay the streamed LTP onto the
  // chain so premiums tick ~1s (vs the 5s poll). Falls back to the fetched chain
  // when nothing is streaming (worker off / non-Upstox source / market closed).
  const streamContracts = useMemo(() => {
    if (instrumentType === "EQ" || !selectedExpiry) return [];
    const out: { instrument_key: string; symbol: string; expiry: string; strike: number; option_type: "CE" | "PE" }[] = [];
    for (const r of chain) {
      if (r.ce_key) out.push({ instrument_key: r.ce_key, symbol: selectedSymbol, expiry: selectedExpiry, strike: r.strike_price, option_type: "CE" });
      if (r.pe_key) out.push({ instrument_key: r.pe_key, symbol: selectedSymbol, expiry: selectedExpiry, strike: r.strike_price, option_type: "PE" });
    }
    return out;
  }, [chain, instrumentType, selectedExpiry, selectedSymbol]);
  const { quotes: optQuotes, isLive: optStreamLive } = useLiveOptionQuotes(streamContracts);

  const liveChain = useMemo(() => {
    if (Object.keys(optQuotes).length === 0) return chain;
    return chain.map((r) => {
      const ce = r.ce_key ? optQuotes[r.ce_key] : undefined;
      const pe = r.pe_key ? optQuotes[r.pe_key] : undefined;
      if (!ce && !pe) return r;
      return {
        ...r,
        ce: ce ? { ...r.ce, ltp: ce.ltp, change: ce.change, changePercent: ce.change_percent } : r.ce,
        pe: pe ? { ...r.pe, ltp: pe.ltp, change: pe.change, changePercent: pe.change_percent } : r.pe,
      };
    });
  }, [chain, optQuotes]);

  // Table view: optionally narrowed to ITM/OTM strikes for the side being traded.
  const tableChain = useMemo(() => {
    if (moneyFilter === "all") return liveChain;
    const side: "CE" | "PE" = instrumentType === "PE" ? "PE" : "CE";
    return liveChain.filter((r) => moneyness(r.strike_price, atmStrike, side) === moneyFilter);
  }, [liveChain, moneyFilter, instrumentType, atmStrike]);

  const canShowMore = strikeRange < TRADE_CONFIG.strikeWindow.max &&
    fullChain.length > chain.length;

  // Aggregate chain insights for the summary bar. Max-pain and PCR use the full
  // provider chain; the OI-change bias uses the visible window (and degrades to
  // null when the feed doesn't supply OI-change, as live Upstox/Dhan do).
  const chainInsights = useMemo(() => {
    if (fullChain.length === 0) return null;
    const totalCe = fullChain[0]?.totalCeOI || fullChain.reduce((s, r) => s + r.ce.oi, 0);
    const totalPe = fullChain[0]?.totalPeOI || fullChain.reduce((s, r) => s + r.pe.oi, 0);
    const pcr = totalCe > 0 ? totalPe / totalCe : 0;
    const maxPain = fullChain.reduce((a, b) => (a.ce.oi + a.pe.oi >= b.ce.oi + b.pe.oi ? a : b)).strike_price;
    const atmRow = fullChain.find((r) => r.strike_price === atmStrike);
    const atmIv = atmRow ? (atmRow.ce.iv + atmRow.pe.iv) / 2 : 0;
    const ceOiChg = chain.reduce((s, r) => s + r.ce.oiChange, 0);
    const peOiChg = chain.reduce((s, r) => s + r.pe.oiChange, 0);
    // Rising call OI = resistance/bearish; rising put OI = support/bullish.
    const hasOiChg = ceOiChg !== 0 || peOiChg !== 0;
    const bias = !hasOiChg ? null : peOiChg > ceOiChg ? "Bullish" : ceOiChg > peOiChg ? "Bearish" : "Neutral";
    return { pcr, maxPain, atmIv, bias };
  }, [fullChain, chain, atmStrike]);

  // IV Rank / IV Percentile from the history series vs the current ATM IV.
  const ivRankPct = useMemo(() => {
    const current = chainInsights?.atmIv ?? 0;
    const series = ivHistory.map((h) => h.atm_iv).filter((v) => v > 0);
    if (current <= 0 || series.length < 2) return null;
    const lo = Math.min(...series);
    const hi = Math.max(...series);
    const rank = hi > lo ? ((current - lo) / (hi - lo)) * 100 : 0;
    const percentile = (series.filter((v) => v < current).length / series.length) * 100;
    return { rank: Math.max(0, Math.min(100, rank)), percentile };
  }, [ivHistory, chainInsights]);

  // Recent traded contracts for the quick re-entry strip.
  useEffect(() => {
    if (!userId) return;
    getRecentContracts(userId, TRADE_CONFIG.recentTradesLimit).then(setRecentContracts);
  }, [userId]);

  // Favorite option contracts (client-only, persisted in localStorage).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (raw) setFavorites(JSON.parse(raw) as FavOption[]);
    } catch { /* ignore malformed storage */ }
  }, []);

  // Saveable workspace: remember the user's chain columns + chart interval.
  const workspaceLoaded = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ts_workspace");
      if (raw) {
        const w = JSON.parse(raw) as { visibleCols?: Partial<typeof visibleCols>; candleInterval?: "1minute" | "30minute" };
        if (w.visibleCols) setVisibleCols((prev) => ({ ...prev, ...w.visibleCols }));
        if (w.candleInterval) setCandleInterval(w.candleInterval);
      }
    } catch { /* ignore */ }
    workspaceLoaded.current = true;
  }, []);
  useEffect(() => {
    if (!workspaceLoaded.current) return;
    try { localStorage.setItem("ts_workspace", JSON.stringify({ visibleCols, candleInterval })); } catch { /* quota */ }
  }, [visibleCols, candleInterval]);

  const persistFavorites = useCallback((next: FavOption[]) => {
    setFavorites(next);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* quota */ }
  }, []);

  const selectedIsFav = useMemo(() => {
    if (selectedStrike == null) return false;
    const k = favKey({ symbol: selectedSymbol, side: selectedSide, strike: selectedStrike, expiry: selectedExpiry });
    return favorites.some((f) => favKey(f) === k);
  }, [favorites, selectedSymbol, selectedSide, selectedStrike, selectedExpiry]);

  const toggleSelectedFav = useCallback(() => {
    if (selectedStrike == null) return;
    const entry: FavOption = { symbol: selectedSymbol, exchange: selectedExchange, name: selectedName, side: selectedSide, strike: selectedStrike, expiry: selectedExpiry };
    const k = favKey(entry);
    const exists = favorites.some((f) => favKey(f) === k);
    persistFavorites(exists ? favorites.filter((f) => favKey(f) !== k) : [entry, ...favorites].slice(0, 30));
  }, [favorites, persistFavorites, selectedSymbol, selectedExchange, selectedName, selectedSide, selectedStrike, selectedExpiry]);

  // Open a favorited contract (re-enters on the same symbol/side; strike is live).
  const openFromFav = useCallback((f: FavOption) => {
    openTradeModal(f.symbol, f.name, f.exchange, f.side);
    if (f.expiry) setSelectedExpiry(f.expiry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lotSize = TRADE_CONFIG.defaultLotSizes[selectedSymbol] ?? 1;
  const isOption = instrumentType !== "EQ";
  // Streamed LTP for the selected contract (when the WS feed is covering it),
  // so the ticket's current premium and the simulated fill tick live too.
  const liveSelectedLtp = useMemo(() => {
    if (!isOption || selectedStrike == null) return null;
    const row = liveChain.find((r) => r.strike_price === selectedStrike);
    const key = row ? (selectedSide === "PE" ? row.pe_key : row.ce_key) : null;
    return key && optQuotes[key] ? optQuotes[key].ltp : null;
  }, [isOption, selectedStrike, selectedSide, liveChain, optQuotes]);
  const currentLtp = isOption
    ? (liveSelectedLtp ?? selectedOptionLtp ?? 0)
    : (quote?.last_price ?? 0);
  const effectivePrice = orderType === "LIMIT" && orderPrice ? parseFloat(orderPrice) : currentLtp;
  const totalShares = isOption ? orderQty * lotSize : orderQty;

  const selectedDelta = useMemo(() => {
    if (!selectedStrike) return null;
    const row = chain.find((r) => r.strike_price === selectedStrike);
    if (!row) return null;
    return selectedSide === "PE" ? row.pe.delta : row.ce.delta;
  }, [chain, selectedStrike, selectedSide]);

  // IV skew: implied vol of CE and PE across the visible strikes.
  const ivSkew = useMemo(
    () => chain.map((r) => ({ strike: r.strike_price, ce: r.ce.iv, pe: r.pe.iv })),
    [chain]
  );

  // Short-term momentum from the underlying candles (last ~6 bars).
  const momentum = useMemo(() => {
    if (candles.length < 6) return null;
    const last = candles[candles.length - 1].c;
    const prior = candles[candles.length - 6].c;
    if (prior <= 0) return null;
    const pct = ((last - prior) / prior) * 100;
    return { pct, dir: pct > 0.1 ? "Up" : pct < -0.1 ? "Down" : "Flat" };
  }, [candles]);

  // Smart entry suggestions: for the active side, pick strikes near target deltas
  // (conservative/balanced/aggressive) and score each with premium, breakeven and
  // probability of profit. Needs greeks — degrades to empty when the feed has none.
  const entrySuggestions = useMemo(() => {
    const side: "CE" | "PE" = instrumentType === "PE" ? "PE" : "CE";
    if (instrumentType === "EQ" || chain.length === 0) return [];
    const hasGreeks = chain.some((r) => Math.abs(side === "CE" ? r.ce.delta : r.pe.delta) > 0.001);
    if (!hasGreeks) return [];
    const S0 = quote?.last_price ?? atmStrike;
    const T = yearsToExpiry(selectedExpiry);
    const targets = [
      { label: "Conservative", d: 0.65 },
      { label: "Balanced", d: 0.5 },
      { label: "Aggressive", d: 0.3 },
    ];
    const seen = new Set<number>();
    const out: { label: string; strike: number; premium: number; pop: number | null; breakeven: number; delta: number }[] = [];
    for (const t of targets) {
      const row = chain.reduce((best, r) => {
        const d = Math.abs(side === "CE" ? r.ce.delta : r.pe.delta);
        const bd = Math.abs(side === "CE" ? best.ce.delta : best.pe.delta);
        return Math.abs(d - t.d) < Math.abs(bd - t.d) ? r : best;
      });
      if (seen.has(row.strike_price)) continue;
      seen.add(row.strike_price);
      const leg = side === "CE" ? row.ce : row.pe;
      const premium = leg.ltp;
      const iv = leg.iv / 100;
      const breakeven = side === "CE" ? row.strike_price + premium : row.strike_price - premium;
      const intrinsicAt = (s: number) => (side === "CE" ? Math.max(0, s - row.strike_price) : Math.max(0, row.strike_price - s));
      const pop = iv > 0 && S0 > 0 ? probOfProfit((s) => intrinsicAt(s) - premium, S0, iv, T) : null;
      out.push({ label: t.label, strike: row.strike_price, premium, pop, breakeven, delta: leg.delta });
    }
    return out;
  }, [chain, instrumentType, quote, atmStrike, selectedExpiry]);

  const numOrNull = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const applyRiskSizing = () => {
    const amt = parseFloat(riskAmount);
    const sl = parseFloat(slPrice);
    if (!Number.isFinite(amt) || amt <= 0 || !Number.isFinite(sl)) return;
    const riskPerLot = (effectivePrice - sl) * lotSize;
    if (riskPerLot <= 0) return;
    setOrderQty(Math.max(1, Math.floor(amt / riskPerLot)));
  };
  const grossValue = effectivePrice * totalShares;
  const estFill = currentLtp > 0
    ? simulateFill({ symbol: selectedSymbol, exchange: selectedExchange, instrument_type: instrumentType, option_type: isOption ? instrumentType : null, strike_price: selectedStrike, expiry_date: selectedExpiry, lot_size: lotSize, order_type: orderType, trade_type: tradeType, quantity: totalShares, price: orderType === "LIMIT" ? parseFloat(orderPrice) || null : null, trigger_price: (orderType === "SL" || orderType === "SL-M") ? parseFloat(orderTrigger) || null : null, notes: null }, currentLtp)
    : null;
  const charges = estFill ? estFill.total_charges : 20;
  const totalValue = grossValue + charges;
  // Selling an option (with no offsetting long) writes it: premium is credited
  // but margin is blocked. EQ sells / closing longs don't block margin.
  const isWritingSell = isOption && tradeType === "SELL";
  const shortMarginEst = isWritingSell
    ? (selectedStrike ?? currentLtp) * totalShares * TRADE_CONFIG.simulation.shortMarginPercent
    : 0;
  const cashAfter = tradeType === "BUY"
    ? virtualCash - totalValue
    : virtualCash + grossValue - charges - shortMarginEst;
  const canAfford = tradeType === "BUY" ? cashAfter >= 0 : !isWritingSell || cashAfter >= 0;

  async function handlePlaceOrder() {
    setPlacing(true);
    const od: OrderFormData = { symbol: selectedSymbol, exchange: selectedExchange, instrument_type: instrumentType, option_type: isOption ? instrumentType : null, strike_price: selectedStrike, expiry_date: selectedExpiry, lot_size: lotSize, order_type: orderType, trade_type: tradeType, quantity: totalShares, price: orderType === "LIMIT" ? parseFloat(orderPrice) || null : null, trigger_price: (orderType === "SL" || orderType === "SL-M") ? parseFloat(orderTrigger) || null : null, notes: orderNotes || null };
    const result = await placeOrder(
      userId,
      od,
      tradeType === "BUY" ? { stop_loss: numOrNull(slPrice), target: numOrNull(targetPrice) } : undefined
    );
    setPlacing(false);
    if (result.success) {
      // Re-read the authoritative balance — the cash effect differs for buys,
      // writes (margin blocked) and closes, so don't guess it client-side.
      reloadBalance();
      // Executed (MARKET, or LIMIT/SL that filled) → a position now exists, so
      // send the user straight to Positions with the new trade highlighted. A
      // full navigation freshly mounts Positions, which loads the latest data +
      // live P&L. PENDING orders (LIMIT/SL awaiting their price) create no
      // position yet, so we keep the in-place "waiting" confirmation instead.
      if (result.fill) {
        window.location.assign(
          `/dashboard/positions?highlight=${encodeURIComponent(selectedSymbol)}`
        );
        return;
      }
      setOrderSuccess({
        msg: `${orderType} order placed for ${selectedSymbol}${isOption && selectedStrike ? ` ${selectedStrike} ${instrumentType}` : ""} — waiting for execution`,
        detail: "It'll appear in Positions once the price condition is met.",
      });
    } else { showToast(result.message, "error"); setConfirmStep(false); }
  }

  const reloadBalance = useCallback(async () => {
    if (!userId) return;
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("virtual_balance")
      .eq("id", userId)
      .single<{ virtual_balance: number }>();
    if (data) setVirtualCash(data.virtual_balance);
  }, [userId]);

  // Keep the latest place-action available to the Enter shortcut (no stale closures).
  useEffect(() => {
    placeActionRef.current = () => {
      if (placing || !canAfford || currentLtp <= 0) return;
      if (confirmStep || fastMode) handlePlaceOrder();
      else setConfirmStep(true);
    };
  });

  // Keyboard shortcuts while the trade modal is open (ignored when typing).
  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();
      if (k === "b") { setTradeType("BUY"); e.preventDefault(); }
      else if (k === "s") { setTradeType("SELL"); e.preventDefault(); }
      else if (k === "+" || k === "=" || k === "arrowup") { setOrderQty((q) => q + 1); e.preventDefault(); }
      else if (k === "-" || k === "arrowdown") { setOrderQty((q) => Math.max(1, q - 1)); e.preventDefault(); }
      else if (k === "enter") { placeActionRef.current(); e.preventDefault(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  if (!mounted) return null;
  const ls = indicesSource === "dhan" || indicesSource === "upstox" ? indicesSource : "demo";

  return (
    <div className={`mx-auto space-y-5 sm:space-y-6 ${modalOpen ? "max-w-4xl lg:max-w-6xl" : "max-w-4xl"}`}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-white">{TRADE_CONFIG.page.title}</h2>
          <p className="text-gray-400 text-xs sm:text-sm mt-0.5">Search and trade stocks or options</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="text-xs sm:text-sm bg-violet-500/10 text-violet-400 border border-violet-500/20 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full font-medium">{INR}{virtualCash.toLocaleString("en-IN")} available</span>
          <LiveBadge source={ls as "dhan" | "upstox" | "demo"} lastUpdated={nifty?.last_updated ?? null} />
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stocks or indices... e.g. NIFTY, RELIANCE, HDFC"
          className={`w-full bg-gray-900 border border-gray-800 rounded-2xl pl-12 pr-12 py-4 text-white placeholder-gray-500 cursor-text ${INTERACTION_CLASSES.formInput}`} />
        {query && <button onClick={() => { setQuery(""); setResults([]); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white cursor-pointer transition-colors duration-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}
      </div>

      {/* Default — index cards (hidden on desktop while the terminal is open) */}
      {!query.trim() && (
        <div className={modalOpen ? "lg:hidden space-y-5 sm:space-y-6" : "space-y-5 sm:space-y-6"}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <IndexQuickCard data={nifty} label="NIFTY 50" source={ls} onTrade={() => openTradeModal("NIFTY", "Nifty 50", "NSE")} />
            <IndexQuickCard data={bankNifty} label="BANK NIFTY" source={ls} onTrade={() => openTradeModal("BANKNIFTY", "Bank Nifty", "NSE")} />
            <IndexQuickCard data={sensex} label="SENSEX" source={ls} exchange="BSE" onTrade={() => openTradeModal("SENSEX", "Sensex", "BSE")} />
          </div>
          {favorites.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">★ Favorite strikes</p>
              <div className="flex flex-wrap gap-2">
                {favorites.map((f) => {
                  const tone = f.side === "PE" ? "text-red-400 border-red-500/30 hover:bg-red-500/10" : "text-green-400 border-green-500/30 hover:bg-green-500/10";
                  return (
                    <span key={favKey(f)} className={`group inline-flex items-center gap-1 text-xs pl-3 pr-1.5 py-1.5 rounded-full border bg-gray-900 ${tone}`}>
                      <button onClick={() => openFromFav(f)} className="cursor-pointer active:scale-95 transition-transform duration-200">
                        <span className="font-semibold">{f.symbol}</span> {f.strike.toLocaleString("en-IN")} {f.side}
                      </button>
                      <button onClick={() => persistFavorites(favorites.filter((x) => favKey(x) !== favKey(f)))} aria-label="Remove favorite"
                        className="text-gray-600 hover:text-red-400 cursor-pointer px-0.5">✕</button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {recentContracts.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">Recent trades</p>
              <div className="flex flex-wrap gap-2">
                {recentContracts.map((rc) => {
                  const isOpt = rc.instrument_type === "CE" || rc.instrument_type === "PE";
                  const tone = rc.instrument_type === "PE" ? "text-red-400 border-red-500/30 hover:bg-red-500/10"
                    : rc.instrument_type === "CE" ? "text-green-400 border-green-500/30 hover:bg-green-500/10"
                    : "text-violet-400 border-violet-500/30 hover:bg-violet-500/10";
                  return (
                    <button
                      key={`${rc.symbol}-${rc.instrument_type}-${rc.strike_price ?? ""}-${rc.expiry_date ?? ""}`}
                      onClick={() => openFromRecent(rc)}
                      className={`text-xs px-3 py-1.5 rounded-full border bg-gray-900 cursor-pointer active:scale-95 transition-all duration-200 ${tone}`}
                    >
                      <span className="font-semibold">{rc.symbol}</span>
                      {isOpt && rc.strike_price ? ` ${rc.strike_price.toLocaleString("en-IN")} ${rc.instrument_type}` : ` ${rc.instrument_type}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <p className="text-center text-xs text-gray-600">Or search for any stock or index above</p>
        </div>
      )}

      {/* Search results */}
      {query.trim().length >= 2 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-400">Results for &ldquo;{query}&rdquo;</p>
            {!searching && <p className="text-xs text-gray-500">{results.length} found</p>}
          </div>
          {searching ? <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />)}</div>
          : results.length > 0 ? <div className="space-y-2">{results.slice(0, 8).map((r) => (
            <button key={`${r.exchange}:${r.symbol}`} onClick={() => openTradeModal(r.symbol, r.company_name, r.exchange)}
              className="w-full flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-4 cursor-pointer hover:border-violet-500/30 transition-all duration-200 text-left">
              <div><span className="text-sm font-bold text-white">{r.symbol}</span><span className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded ml-2">{r.exchange}</span><p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{r.company_name}</p></div>
              <span className="text-xs text-violet-400 shrink-0">Trade &rarr;</span>
            </button>
          ))}</div>
          : <div className="text-center py-8 text-gray-500 text-sm">No results found for &ldquo;{query}&rdquo;</div>}
        </div>
      )}

      {/* Trade ticket — inline terminal on desktop, bottom-sheet on mobile */}
      <Modal size="terminal" isOpen={modalOpen} onClose={() => { setModalOpen(false); setOrderSuccess(null); setConfirmStep(false); }} title={`${selectedSymbol} — ${tradeMode === "strategy" ? "Strategy" : "Place Order"}`}>
        <div className="space-y-4">
          {orderSuccess ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-lg font-bold text-white">Order Executed!</p>
              <p className="text-sm text-gray-400 mt-2">{orderSuccess.msg}</p>
              <p className="text-xs text-gray-500 mt-1">{orderSuccess.detail}</p>
              <div className="flex gap-3 mt-6">
                <button onClick={() => { setModalOpen(false); setOrderSuccess(null); }} className={`${INTERACTION_CLASSES.secondaryButton} flex-1 text-sm text-gray-300 py-2.5 rounded-lg`}>Done</button>
                <button onClick={() => { setOrderSuccess(null); setConfirmStep(false); setOrderQty(1); }} className={`${INTERACTION_CLASSES.primaryButton} flex-1 text-sm text-white py-2.5 rounded-lg`}>Trade Again</button>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-white">{selectedSymbol}</p>
                  <p className="text-xs text-gray-400">{selectedName}</p>
                </div>
                {quote && (
                  <div className="text-right">
                    <p className="text-xl font-bold text-white">{INR}{quote.last_price.toFixed(2)}</p>
                    <p className={`text-sm ${getPnLColor(quote.change)}`}>{quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.change_percent.toFixed(2)}%)</p>
                  </div>
                )}
              </div>

              {/* Underlying price chart */}
              {candles.length > 1 && (() => {
                const first = candles[0].c;
                const last = candles[candles.length - 1].c;
                const up = last >= first;
                const color = up ? "#22c55e" : "#ef4444";
                const lo = Math.min(...candles.map((c) => c.l || c.c));
                const hi = Math.max(...candles.map((c) => c.h || c.c));
                const pad = (hi - lo) * 0.1 || 1;
                const fmtT = (t: number) => new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
                return (
                  <div className="bg-gray-800/40 rounded-lg p-2">
                    <div className="flex items-center justify-between mb-1 px-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400">Price</span>
                        {candleSource === "mock" && <span className="text-[9px] text-gray-600 border border-gray-700 rounded px-1">demo</span>}
                        {momentum && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${momentum.dir === "Up" ? "bg-green-500/15 text-green-400" : momentum.dir === "Down" ? "bg-red-500/15 text-red-400" : "bg-gray-700/50 text-gray-400"}`} title="Short-term momentum (last ~6 bars)">
                            {momentum.dir === "Up" ? "▲" : momentum.dir === "Down" ? "▼" : "▬"} {momentum.pct >= 0 ? "+" : ""}{formatPercent(momentum.pct)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {(["1minute", "30minute"] as const).map((iv) => (
                          <button key={iv} onClick={() => setCandleInterval(iv)}
                            className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer active:scale-95 transition-all duration-200 ${candleInterval === iv ? "bg-violet-500/20 text-violet-300" : "text-gray-500 hover:text-white"}`}>
                            {iv === "1minute" ? "1m" : "30m"}
                          </button>
                        ))}
                        <button onClick={() => setShowChart(false)} aria-label="Hide chart" className="text-[10px] text-gray-500 hover:text-white cursor-pointer ml-1">✕</button>
                      </div>
                    </div>
                    <div className="h-28 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={candles} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="t" tickFormatter={fmtT} stroke="#6b7280" fontSize={9} tickLine={false} axisLine={false} minTickGap={40} />
                          <YAxis domain={[lo - pad, hi + pad]} stroke="#6b7280" fontSize={9} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })} />
                          <Tooltip
                            formatter={(v) => [`${INR}${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Close"]}
                            labelFormatter={(l) => fmtT(Number(l))}
                            contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 11 }}
                          />
                          <Area type="monotone" dataKey="c" stroke={color} strokeWidth={1.5} fill="url(#priceFill)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}
              {!showChart && (
                <button onClick={() => setShowChart(true)} className="text-[11px] text-violet-400 hover:text-violet-300 cursor-pointer transition-colors duration-200">+ Show price chart</button>
              )}

              {/* Mode: Single | Strategy */}
              <div className="flex gap-1 bg-gray-800/50 p-1 rounded-lg">
                {(["single", "strategy"] as const).map((m) => (
                  <button key={m} onClick={() => setTradeMode(m)}
                    className={`flex-1 text-xs font-semibold py-1.5 rounded-md cursor-pointer transition-all duration-200 active:scale-95 ${tradeMode === m ? "bg-violet-500 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"}`}>
                    {m === "single" ? "Single Order" : "Strategy"}
                  </button>
                ))}
              </div>

              {/* CE / PE tabs */}
              {tradeMode === "single" && (
              <div className="flex gap-1 bg-gray-800/50 p-1 rounded-lg">
                {(["CE", "PE"] as const).map((t) => (
                  <button key={t} onClick={() => { setInstrumentType(t); setSelectedStrike(null); setSelectedOptionLtp(null); setSelectedSide(t); }}
                    className={`flex-1 text-sm font-semibold py-2 rounded-md cursor-pointer transition-all duration-200 active:scale-95 ${instrumentType === t ? "bg-violet-500 text-white shadow-md" : "text-gray-400 hover:text-white hover:bg-gray-700"}`}>
                    {t === "CE" ? "Call (CE)" : "Put (PE)"}
                  </button>
                ))}
              </div>
              )}

              {/* Expiry dropdown */}
              {isOption && expiries.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Expiry Date</label>
                  {/* Quick-tabs for the nearest expiries; full list stays in the dropdown. */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {expiries.slice(0, 4).map((exp) => (
                      <button
                        key={exp}
                        onClick={() => { setSelectedExpiry(exp); setSelectedStrike(null); setSelectedOptionLtp(null); }}
                        className={`text-[11px] px-2.5 py-1 rounded-md cursor-pointer active:scale-95 transition-all duration-200 ${
                          selectedExpiry === exp
                            ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                            : "bg-gray-800 text-gray-400 hover:text-white border border-transparent"
                        }`}
                      >
                        {fmtExpiryShort(exp)}{isMonthlyExpiry(exp) ? " · M" : ""}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <select
                      value={selectedExpiry ?? ""}
                      onChange={(e) => { setSelectedExpiry(e.target.value); setSelectedStrike(null); setSelectedOptionLtp(null); }}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm font-medium cursor-pointer appearance-none focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all duration-200"
                    >
                      {expiries.map((exp) => (
                        <option key={exp} value={exp}>
                          {fmtExpiry(exp)} {isMonthlyExpiry(exp) ? "(Monthly)" : "(Weekly)"}
                        </option>
                      ))}
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">{"\u25BC"}</span>
                  </div>
                </div>
              )}

              {tradeMode === "strategy" && (
                <StrategyBuilder
                  chain={chain}
                  chainsByExpiry={chainsByExpiry}
                  expiries={expiries}
                  loadChainFor={loadChainFor}
                  atmStrike={atmStrike}
                  lotSize={lotSize}
                  symbol={selectedSymbol}
                  expiry={selectedExpiry}
                  exchange={selectedExchange}
                  userId={userId}
                />
              )}

              {tradeMode === "single" && (
              <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-4 lg:items-start space-y-4 lg:space-y-0">
              {/* Market pane — option chain */}
              <div className="space-y-4 min-w-0">
              {/* Option chain — rich table */}
              {isOption && (chainLoading ? (
                <div className="space-y-1.5 animate-pulse">{[...Array(6)].map((_, i) => <div key={i} className="h-9 bg-gray-800 rounded-lg" />)}</div>
              ) : chain.length > 0 ? (
                <div>
                  {/* Insight summary bar — sentiment / max-pain / ATM IV / OI bias */}
                  {chainInsights && (
                    <div className="flex items-center gap-2 mb-2 overflow-x-auto whitespace-nowrap text-[11px] pb-0.5">
                      <span className={`px-2 py-0.5 rounded-md ${chainInsights.pcr > 1.2 ? "bg-green-500/15 text-green-400" : chainInsights.pcr < 0.8 ? "bg-red-500/15 text-red-400" : "bg-gray-700/50 text-gray-300"}`}>
                        PCR <span className="font-semibold">{chainInsights.pcr.toFixed(2)}</span> · {chainInsights.pcr > 1.2 ? "Bullish" : chainInsights.pcr < 0.8 ? "Bearish" : "Neutral"}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-400">Max Pain <span className="font-semibold">{chainInsights.maxPain.toLocaleString("en-IN")}</span></span>
                      {chainInsights.atmIv > 0 && <span className="px-2 py-0.5 rounded-md bg-gray-700/50 text-gray-300">ATM IV <span className="font-semibold">{chainInsights.atmIv.toFixed(1)}%</span></span>}
                      {ivRankPct && (
                        <span className={`px-2 py-0.5 rounded-md ${ivRankPct.rank > 60 ? "bg-red-500/15 text-red-400" : ivRankPct.rank < 30 ? "bg-green-500/15 text-green-400" : "bg-gray-700/50 text-gray-300"}`} title="IV Rank (vol cheap↔rich vs its own history)">
                          IVR <span className="font-semibold">{ivRankPct.rank.toFixed(0)}</span> · IVP {ivRankPct.percentile.toFixed(0)}
                        </span>
                      )}
                      {chainInsights.bias && (
                        <span className={`px-2 py-0.5 rounded-md ${chainInsights.bias === "Bullish" ? "bg-green-500/15 text-green-400" : chainInsights.bias === "Bearish" ? "bg-red-500/15 text-red-400" : "bg-gray-700/50 text-gray-300"}`} title="OI build-up bias from rising call vs put OI">
                          OI bias <span className="font-semibold">{chainInsights.bias}</span>
                        </span>
                      )}
                      <button onClick={() => setShowSkew((v) => !v)} className={`px-2 py-0.5 rounded-md cursor-pointer active:scale-95 transition-all duration-200 ${showSkew ? "bg-violet-500/20 text-violet-300" : "bg-gray-700/50 text-gray-400 hover:text-white"}`}>IV skew</button>
                      {ivHistory.length > 1 && (
                        <button onClick={() => setShowIvHistory((v) => !v)} className={`px-2 py-0.5 rounded-md cursor-pointer active:scale-95 transition-all duration-200 ${showIvHistory ? "bg-violet-500/20 text-violet-300" : "bg-gray-700/50 text-gray-400 hover:text-white"}`}>IV/OI history</button>
                      )}
                    </div>
                  )}

                  {/* IV & OI over time */}
                  {showIvHistory && ivHistory.length > 1 && (
                    <div className="bg-gray-800/40 rounded-lg p-2 mb-2">
                      <div className="h-36 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={ivHistory} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                            <XAxis dataKey="captured_on" stroke="#6b7280" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} minTickGap={30} />
                            <YAxis yAxisId="iv" stroke="#6b7280" fontSize={9} tickLine={false} axisLine={false} width={28} tickFormatter={(v) => `${v}`} />
                            <YAxis yAxisId="oi" orientation="right" stroke="#6b7280" fontSize={9} tickLine={false} axisLine={false} width={32} tickFormatter={(v) => (Math.abs(v) >= 1e7 ? `${(v / 1e7).toFixed(0)}Cr` : Math.abs(v) >= 1e5 ? `${(v / 1e5).toFixed(0)}L` : `${v}`)} />
                            <Tooltip
                              formatter={(v, n) => [n === "atm_iv" ? `${Number(v).toFixed(1)}%` : Number(v).toLocaleString("en-IN"), n === "atm_iv" ? "ATM IV" : n === "total_ce_oi" ? "Call OI" : "Put OI"]}
                              labelFormatter={(l) => new Date(`${l}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                              contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 11 }}
                            />
                            <Bar yAxisId="oi" dataKey="total_ce_oi" fill="#22c55e" opacity={0.25} />
                            <Bar yAxisId="oi" dataKey="total_pe_oi" fill="#ef4444" opacity={0.25} />
                            <Line yAxisId="iv" type="monotone" dataKey="atm_iv" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-0.5 px-1"><span className="text-violet-400">━</span> ATM IV · <span className="text-green-400">▮</span> Call OI · <span className="text-red-400">▮</span> Put OI</p>
                    </div>
                  )}

                  {/* IV skew — CE vs PE implied vol across strikes */}
                  {showSkew && ivSkew.length > 1 && (
                    <div className="bg-gray-800/40 rounded-lg p-2 mb-2">
                      <div className="h-32 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={ivSkew} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                            <XAxis dataKey="strike" stroke="#6b7280" fontSize={9} tickLine={false} axisLine={false} />
                            <YAxis stroke="#6b7280" fontSize={9} tickLine={false} axisLine={false} width={30} tickFormatter={(v) => `${v}`} />
                            <Tooltip formatter={(v, n) => [`${Number(v).toFixed(1)}%`, n === "ce" ? "Call IV" : "Put IV"]} labelFormatter={(l) => `Strike ${Number(l).toLocaleString("en-IN")}`} contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 11 }} />
                            {atmStrike > 0 && <ReferenceLine x={atmStrike} stroke="#8b5cf6" strokeDasharray="3 3" />}
                            <Line type="monotone" dataKey="ce" stroke="#22c55e" strokeWidth={1.5} dot={false} />
                            <Line type="monotone" dataKey="pe" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-0.5 px-1"><span className="text-green-400">━</span> Call IV · <span className="text-red-400">━</span> Put IV · ATM dashed</p>
                    </div>
                  )}
                  {/* Controls: moneyness filter (left) + column toggle (right) */}
                  <div className="flex items-center justify-between mb-1.5 relative">
                    <div className="flex gap-1">
                      {(["all", "ITM", "OTM"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setMoneyFilter(m)}
                          title={m === "all" ? "All strikes" : `${m} strikes for the ${instrumentType === "PE" ? "Put" : "Call"} side`}
                          className={`text-[10px] px-2 py-0.5 rounded-md cursor-pointer active:scale-95 transition-all duration-200 ${
                            moneyFilter === m
                              ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                              : "bg-gray-800 text-gray-400 hover:text-white border border-transparent"
                          }`}
                        >
                          {m === "all" ? "All" : m}
                        </button>
                      ))}
                      {optStreamLive && (
                        <span
                          title="Streaming live premiums over WebSocket"
                          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-green-500/15 text-green-400 border border-green-500/30"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          Live
                        </span>
                      )}
                    </div>
                    <button onClick={() => setShowColMenu(!showColMenu)} className="text-[10px] text-gray-500 hover:text-violet-400 cursor-pointer transition-colors duration-200">Columns {"\u25BE"}</button>
                    {showColMenu && (
                      <div className="absolute right-0 top-5 z-50 bg-gray-800 border border-gray-700 rounded-lg p-2 shadow-xl space-y-1">
                        {(Object.keys(visibleCols) as (keyof typeof visibleCols)[]).map((col) => (
                          <label key={col} className="flex items-center gap-2 text-[10px] text-gray-300 cursor-pointer hover:text-white">
                            <input type="checkbox" checked={visibleCols[col]} onChange={() => setVisibleCols((p) => ({ ...p, [col]: !p[col] }))} className="w-3 h-3 rounded cursor-pointer" />
                            {({ oi: "OI", oiChg: "OI Change", vol: "Volume", iv: "IV", delta: "Delta", gamma: "Gamma", theta: "Theta", vega: "Vega", bidAsk: "Bid/Ask" })[col]}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Scrollable table */}
                  <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-[11px] min-w-[500px]">
                      <thead>
                        <tr>
                          {visibleCols.oi && <th className="py-1.5 px-1.5 text-right text-green-400 bg-green-500/5" title="Open Interest — total outstanding contracts">OI</th>}
                          {visibleCols.oiChg && <th className="py-1.5 px-1.5 text-right text-green-400 bg-green-500/5">OI CHG</th>}
                          {visibleCols.vol && <th className="py-1.5 px-1.5 text-right text-green-400 bg-green-500/5">VOL</th>}
                          {visibleCols.iv && <th className="py-1.5 px-1.5 text-right text-green-400 bg-green-500/5" title="Implied Volatility — expected price movement">IV</th>}
                          {visibleCols.delta && <th className="py-1.5 px-1.5 text-right text-green-400 bg-green-500/5" title="Delta \u2014 rate of change vs underlying price">{"\u0394"}</th>}
                          {visibleCols.gamma && <th className="py-1.5 px-1.5 text-right text-green-400 bg-green-500/5" title="Gamma \u2014 rate of change of delta">{"\u0393"}</th>}
                          {visibleCols.theta && <th className="py-1.5 px-1.5 text-right text-green-400 bg-green-500/5" title="Theta \u2014 daily time decay">{"\u0398"}</th>}
                          {visibleCols.vega && <th className="py-1.5 px-1.5 text-right text-green-400 bg-green-500/5" title="Vega \u2014 sensitivity to a 1% change in IV">V</th>}
                          {visibleCols.bidAsk && <th className="py-1.5 px-1.5 text-right text-green-400 bg-green-500/5">B/A</th>}
                          <th className="py-1.5 px-1.5 text-right text-green-400 bg-green-500/5 font-bold">CE</th>
                          <th className="py-1.5 px-2 text-center text-violet-400 bg-violet-500/5 font-bold sticky left-0 bg-gray-900 z-10">STRIKE</th>
                          <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5 font-bold">PE</th>
                          {visibleCols.bidAsk && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5">B/A</th>}
                          {visibleCols.vega && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5" title="Vega \u2014 sensitivity to a 1% change in IV">V</th>}
                          {visibleCols.theta && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5" title="Theta \u2014 daily time decay">{"\u0398"}</th>}
                          {visibleCols.gamma && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5" title="Gamma \u2014 rate of change of delta">{"\u0393"}</th>}
                          {visibleCols.delta && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5" title="Delta \u2014 rate of change vs underlying price">{"\u0394"}</th>}
                          {visibleCols.iv && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5">IV</th>}
                          {visibleCols.vol && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5">VOL</th>}
                          {visibleCols.oiChg && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5">OI CHG</th>}
                          {visibleCols.oi && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5">OI</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {tableChain.map((row) => {
                          const isAtm = row.strike_price === atmStrike;
                          const isSel = row.strike_price === selectedStrike;
                          const isFlash = row.strike_price === flashStrike;
                          const maxOi = Math.max(...chain.map((r) => Math.max(r.ce.oi, r.pe.oi)), 1);
                          const maxPainStrike = chain.reduce((a, b) => (a.ce.oi + a.pe.oi > b.ce.oi + b.pe.oi ? a : b)).strike_price;
                          const isMaxPain = row.strike_price === maxPainStrike;
                          const pcrBg = row.pcr > 1.2 ? "bg-green-500/20 text-green-400" : row.pcr < 0.8 ? "bg-red-500/20 text-red-400" : "bg-gray-500/20 text-gray-400";
                          const ivColor = (iv: number) => iv > 20 ? "text-red-400" : iv > 16 ? "text-orange-400" : iv > 12 ? "text-yellow-400" : "text-green-400";
                          const dColor = (d: number) => Math.abs(d) > 0.5 ? (d > 0 ? "text-green-400" : "text-red-400") : Math.abs(d) > 0.3 ? "text-yellow-400" : "text-gray-500";
                          const tColor = (t: number) => t < 0 ? "text-red-400" : "text-gray-400";
                          const ceBuild = classifyBuildup(row.ce.changePercent, row.ce.oiChange);
                          const peBuild = classifyBuildup(row.pe.changePercent, row.pe.oiChange);
                          const buildLabel = (k: ReturnType<typeof classifyBuildup>) => k ? TRADE_CONFIG.buildup[k].label : "OI change";

                          return (
                            <tr key={row.strike_price} className={`border-b border-gray-800/30 transition-colors duration-100 ${isFlash ? "strike-selected" : ""} ${
                              isSel ? "bg-violet-600/10" : isAtm ? "bg-violet-500/5" : isMaxPain ? "bg-yellow-500/5" : "hover:bg-gray-800/50"
                            }`}>
                              {visibleCols.oi && (
                                <td className="py-1.5 px-1.5 text-right">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-gray-400">{formatOI(row.ce.oi)}</span>
                                    <div className="w-14 h-1 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-green-500/50 rounded-full" style={{ width: `${(row.ce.oi / maxOi) * 100}%` }} /></div>
                                  </div>
                                </td>
                              )}
                              {visibleCols.oiChg && (
                                <td className={`py-1.5 px-1.5 text-right ${row.ce.oiChange >= 0 ? "text-green-400" : "text-red-400"}`} title={buildLabel(ceBuild)}>
                                  {ceBuild && <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${TRADE_CONFIG.buildup[ceBuild].tone === "green" ? "bg-green-400" : "bg-red-400"}`} />}
                                  {row.ce.oiChange >= 0 ? "\u2191" : "\u2193"}{formatOI(Math.abs(row.ce.oiChange))}
                                </td>
                              )}
                              {visibleCols.vol && <td className="py-1.5 px-1.5 text-right text-gray-500">{formatOI(row.ce.volume)}</td>}
                              {visibleCols.iv && <td className={`py-1.5 px-1.5 text-right ${ivColor(row.ce.iv)}`}>{row.ce.iv.toFixed(1)}</td>}
                              {visibleCols.delta && <td className={`py-1.5 px-1.5 text-right ${dColor(row.ce.delta)}`}>{row.ce.delta.toFixed(2)}</td>}
                              {visibleCols.gamma && <td className="py-1.5 px-1.5 text-right text-gray-400">{row.ce.gamma.toFixed(4)}</td>}
                              {visibleCols.theta && <td className={`py-1.5 px-1.5 text-right ${tColor(row.ce.theta)}`}>{row.ce.theta.toFixed(2)}</td>}
                              {visibleCols.vega && <td className="py-1.5 px-1.5 text-right text-gray-400">{row.ce.vega.toFixed(2)}</td>}
                              {visibleCols.bidAsk && (
                                <td className="py-1.5 px-1.5 text-right">
                                  <span className="text-green-400">{row.ce.bid.toFixed(1)}</span>/<span className="text-red-400">{row.ce.ask.toFixed(1)}</span>
                                </td>
                              )}
                              <td className={`py-1.5 px-1.5 text-right cursor-pointer ${row.strike_price < atmStrike ? "bg-green-500/5" : ""}`} onClick={() => handleStrikeSelect(row.strike_price, row.ce.ltp, "CE")}>
                                <span className={`font-semibold ${isSel && selectedSide === "CE" ? "text-green-300" : "text-green-400"} hover:text-green-300`}>
                                  {row.ce.ltp.toFixed(2)}{isSel && selectedSide === "CE" && " \u2713"}
                                </span>
                              </td>
                              <td className={`py-1.5 px-2 text-center font-bold sticky left-0 bg-gray-900 z-10 ${isSel ? "text-violet-300" : isAtm ? "text-violet-400" : "text-white"}`}>
                                {row.strike_price.toLocaleString("en-IN")}
                                {isAtm && <div className="text-[9px] text-violet-400 font-normal">ATM</div>}
                                {isMaxPain && <div className="text-[9px] text-yellow-400 font-normal">{"\u26A1"}MAX PAIN</div>}
                                {row.pcr > 0 && <div className={`text-[9px] px-1 rounded mt-0.5 inline-block ${pcrBg}`}>{row.pcr > 1.2 ? "\uD83D\uDC02" : row.pcr < 0.8 ? "\uD83D\uDC3B" : "\u2696\uFE0F"}{row.pcr.toFixed(2)}</div>}
                              </td>
                              <td className={`py-1.5 px-1.5 text-left cursor-pointer ${row.strike_price > atmStrike ? "bg-red-500/5" : ""}`} onClick={() => handleStrikeSelect(row.strike_price, row.pe.ltp, "PE")}>
                                <span className={`font-semibold ${isSel && selectedSide === "PE" ? "text-red-300" : "text-red-400"} hover:text-red-300`}>
                                  {isSel && selectedSide === "PE" && "\u2713 "}{row.pe.ltp.toFixed(2)}
                                </span>
                              </td>
                              {visibleCols.bidAsk && (
                                <td className="py-1.5 px-1.5 text-left">
                                  <span className="text-green-400">{row.pe.bid.toFixed(1)}</span>/<span className="text-red-400">{row.pe.ask.toFixed(1)}</span>
                                </td>
                              )}
                              {visibleCols.vega && <td className="py-1.5 px-1.5 text-left text-gray-400">{row.pe.vega.toFixed(2)}</td>}
                              {visibleCols.theta && <td className={`py-1.5 px-1.5 text-left ${tColor(row.pe.theta)}`}>{row.pe.theta.toFixed(2)}</td>}
                              {visibleCols.gamma && <td className="py-1.5 px-1.5 text-left text-gray-400">{row.pe.gamma.toFixed(4)}</td>}
                              {visibleCols.delta && <td className={`py-1.5 px-1.5 text-left ${dColor(row.pe.delta)}`}>{row.pe.delta.toFixed(2)}</td>}
                              {visibleCols.iv && <td className={`py-1.5 px-1.5 text-left ${ivColor(row.pe.iv)}`}>{row.pe.iv.toFixed(1)}</td>}
                              {visibleCols.vol && <td className="py-1.5 px-1.5 text-left text-gray-500">{formatOI(row.pe.volume)}</td>}
                              {visibleCols.oiChg && (
                                <td className={`py-1.5 px-1.5 text-left ${row.pe.oiChange >= 0 ? "text-green-400" : "text-red-400"}`} title={buildLabel(peBuild)}>
                                  {peBuild && <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${TRADE_CONFIG.buildup[peBuild].tone === "green" ? "bg-green-400" : "bg-red-400"}`} />}
                                  {row.pe.oiChange >= 0 ? "\u2191" : "\u2193"}{formatOI(Math.abs(row.pe.oiChange))}
                                </td>
                              )}
                              {visibleCols.oi && (
                                <td className="py-1.5 px-1.5 text-left">
                                  <div className="flex flex-col items-start gap-0.5">
                                    <span className="text-gray-400">{formatOI(row.pe.oi)}</span>
                                    <div className="w-14 h-1 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-red-500/50 rounded-full" style={{ width: `${(row.pe.oi / maxOi) * 100}%` }} /></div>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                        {/* Summary row */}
                        <tr className="border-t border-gray-700">
                          {visibleCols.oi && <td className="py-1.5 px-1.5 text-right text-green-400 font-semibold">{formatOI(chain.reduce((s, r) => s + r.ce.oi, 0))}</td>}
                          {visibleCols.oiChg && <td />}{visibleCols.vol && <td />}{visibleCols.iv && <td />}{visibleCols.delta && <td />}{visibleCols.gamma && <td />}{visibleCols.theta && <td />}{visibleCols.vega && <td />}{visibleCols.bidAsk && <td />}
                          <td className="py-1.5 px-1.5 text-right text-[10px] text-gray-500">TOTAL</td>
                          <td className="py-1.5 px-2 text-center sticky left-0 bg-gray-900 z-10">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${chain[0]?.totalPeOI && chain[0]?.totalCeOI ? (chain[0].totalPeOI / chain[0].totalCeOI > 1 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400") : "text-gray-500"}`}>
                              PCR {chain[0]?.totalCeOI ? (chain[0].totalPeOI / chain[0].totalCeOI).toFixed(2) : "—"}
                            </span>
                          </td>
                          <td className="py-1.5 px-1.5 text-left text-[10px] text-gray-500">TOTAL</td>
                          {visibleCols.bidAsk && <td />}{visibleCols.vega && <td />}{visibleCols.theta && <td />}{visibleCols.gamma && <td />}{visibleCols.delta && <td />}{visibleCols.iv && <td />}{visibleCols.vol && <td />}{visibleCols.oiChg && <td />}
                          {visibleCols.oi && <td className="py-1.5 px-1.5 text-left text-red-400 font-semibold">{formatOI(chain.reduce((s, r) => s + r.pe.oi, 0))}</td>}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {/* Strike-window controls */}
                  <div className="flex items-center justify-center gap-3 mt-1.5">
                    {canShowMore && (
                      <button
                        onClick={() => setStrikeRange((r) => Math.min(TRADE_CONFIG.strikeWindow.max, r + TRADE_CONFIG.strikeWindow.step))}
                        className="text-[11px] text-violet-400 hover:text-violet-300 cursor-pointer active:scale-95 transition-all duration-200"
                      >
                        + Show more strikes
                      </button>
                    )}
                    {strikeRange > TRADE_CONFIG.strikeWindow.initial && (
                      <button
                        onClick={() => setStrikeRange(TRADE_CONFIG.strikeWindow.initial)}
                        className="text-[11px] text-gray-500 hover:text-white cursor-pointer transition-colors duration-200"
                      >
                        Show fewer
                      </button>
                    )}
                  </div>
                  {tableChain.length === 0 && (
                    <p className="text-center text-xs text-gray-500 py-3">No {moneyFilter} strikes in view — try &ldquo;All&rdquo; or show more strikes.</p>
                  )}
                </div>
              ) : null)}

              </div>{/* end market pane */}

              {/* Ticket pane */}
              <div className="space-y-4 min-w-0">
              {/* Smart entry suggestions */}
              {isOption && entrySuggestions.length > 0 && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-300 mb-2">{"💡"} Suggested {instrumentType} strikes</p>
                  <div className="space-y-1.5">
                    {entrySuggestions.map((s) => (
                      <button
                        key={s.strike}
                        onClick={() => { const row = chain.find((r) => r.strike_price === s.strike); if (row) handleStrikeSelect(s.strike, instrumentType === "PE" ? row.pe.ltp : row.ce.ltp, instrumentType === "PE" ? "PE" : "CE"); }}
                        className="w-full flex items-center justify-between gap-2 text-left bg-gray-900 hover:bg-gray-800 rounded-md px-2.5 py-2 cursor-pointer active:scale-[0.99] transition-all duration-200 border border-gray-800 hover:border-violet-500/30"
                      >
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-white">{s.strike.toLocaleString("en-IN")} {instrumentType}</span>
                          <span className="text-[10px] text-gray-500 ml-1.5">{s.label} · {"Δ"}{Math.abs(s.delta).toFixed(2)}</span>
                        </div>
                        <div className="text-right text-[11px] shrink-0">
                          <span className="text-gray-300">{INR}{s.premium.toFixed(1)}</span>
                          {s.pop != null && <span className="text-gray-500 ml-2">POP {formatPercent(s.pop)}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1.5">Heuristic by delta for a {tradeType === "SELL" ? "write" : "buy"} — not advice.</p>
                </div>
              )}
              {/* Selected option */}
              {isOption && selectedStrike && (() => {
                const mny = moneyness(selectedStrike, atmStrike, selectedSide);
                const mnyCls = mny === "ITM" ? "bg-green-500/15 text-green-400" : mny === "OTM" ? "bg-gray-700/50 text-gray-400" : "bg-violet-500/15 text-violet-300";
                return (
                  <div className="bg-gray-800 rounded-lg p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
                        {selectedSymbol} {selectedExpiry && fmtExpiry(selectedExpiry)} {selectedStrike} {instrumentType}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${mnyCls}`}>{mny}</span>
                      </p>
                      <p className="text-sm text-gray-400 mt-0.5">LTP: {INR}{selectedOptionLtp?.toFixed(2)} | Lot: {lotSize} shares</p>
                    </div>
                    {/* Favorite + ±1 strike stepper (same side) */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={toggleSelectedFav} aria-label={selectedIsFav ? "Remove favorite" : "Add favorite"} title={selectedIsFav ? "Remove from favorites" : "Add to favorites"}
                        className={`w-7 h-7 rounded-md bg-gray-900 flex items-center justify-center cursor-pointer active:scale-95 transition-all duration-200 text-sm ${selectedIsFav ? "text-yellow-400" : "text-gray-500 hover:text-yellow-400"}`}>{selectedIsFav ? "★" : "☆"}</button>
                      <button onClick={() => shiftStrike(-1)} aria-label="Lower strike"
                        className="w-7 h-7 rounded-md bg-gray-900 text-gray-300 hover:text-white flex items-center justify-center cursor-pointer active:scale-95 transition-all duration-200 text-sm font-bold">{"◀"}</button>
                      <button onClick={() => shiftStrike(1)} aria-label="Higher strike"
                        className="w-7 h-7 rounded-md bg-gray-900 text-gray-300 hover:text-white flex items-center justify-center cursor-pointer active:scale-95 transition-all duration-200 text-sm font-bold">{"▶"}</button>
                    </div>
                  </div>
                );
              })()}

              {/* Premium movement sparkline (scalper view) */}
              {isOption && selectedStrike && premiumTicks.length > 1 && (() => {
                const first = premiumTicks[0].p;
                const last = premiumTicks[premiumTicks.length - 1].p;
                const up = last >= first;
                const color = up ? "#22c55e" : "#ef4444";
                const chg = first > 0 ? ((last - first) / first) * 100 : 0;
                return (
                  <div className="bg-gray-800/40 rounded-lg p-2">
                    <div className="flex items-center justify-between mb-1 px-1">
                      <span className="text-[11px] text-gray-400">Premium movement</span>
                      <span className={`text-[11px] font-medium ${up ? "text-green-400" : "text-red-400"}`}>{INR}{last.toFixed(2)} ({chg >= 0 ? "+" : ""}{formatPercent(chg)})</span>
                    </div>
                    <div className="h-16 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={premiumTicks} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="premFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <YAxis hide domain={["dataMin", "dataMax"]} />
                          <Area type="monotone" dataKey="p" stroke={color} strokeWidth={1.5} fill="url(#premFill)" dot={false} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-0.5 px-1">Since you opened this contract · updates ~5s</p>
                  </div>
                );
              })()}

              {/* Buy/Sell */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setTradeType("BUY")} className={`py-2.5 rounded-lg text-sm font-bold cursor-pointer transition-all duration-200 active:scale-95 ${tradeType === "BUY" ? "bg-green-500 text-white" : "border border-green-500/30 text-green-400 hover:bg-green-500/10"}`}>BUY</button>
                <button onClick={() => setTradeType("SELL")} className={`py-2.5 rounded-lg text-sm font-bold cursor-pointer transition-all duration-200 active:scale-95 ${tradeType === "SELL" ? "bg-red-500 text-white" : "border border-red-500/30 text-red-400 hover:bg-red-500/10"}`}>SELL</button>
              </div>

              {/* Order type */}
              <div className="flex gap-1 bg-gray-800/50 p-1 rounded-lg">
                {(["MARKET", "LIMIT", "SL", "SL-M"] as OrderType[]).map((ot) => (
                  <button key={ot} onClick={() => setOrderType(ot)} className={`flex-1 text-xs font-semibold py-1.5 rounded-md cursor-pointer transition-all duration-200 active:scale-95 ${orderType === ot ? "bg-violet-500 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"}`}>
                    {TRADE_CONFIG.orderTypes[ot]}
                  </button>
                ))}
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">{isOption ? "Lots" : "Quantity"}</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setOrderQty(Math.max(1, orderQty - 1))} className="w-8 h-8 bg-gray-800 rounded-lg text-gray-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors duration-200 active:scale-95 text-sm font-bold">&minus;</button>
                  <input type="number" min={1} value={orderQty} onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className={`flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base font-semibold text-white text-center cursor-text ${INTERACTION_CLASSES.formInput}`} />
                  <button onClick={() => setOrderQty(orderQty + 1)} className="w-8 h-8 bg-gray-800 rounded-lg text-gray-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors duration-200 active:scale-95 text-sm font-bold">+</button>
                </div>
                {isOption && <p className="text-xs text-gray-500 mt-1">= {totalShares} shares ({orderQty} lot{orderQty > 1 ? "s" : ""})</p>}
                <div className="flex gap-1.5 mt-2">
                  {[1, 2, 5, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setOrderQty(n)}
                      className={`text-[11px] px-2 py-1 rounded-md cursor-pointer active:scale-95 transition-all duration-200 ${orderQty === n ? "bg-violet-500/20 text-violet-300 border border-violet-500/40" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                    >
                      {n}{isOption ? ` lot${n > 1 ? "s" : ""}` : ""}
                    </button>
                  ))}
                </div>
              </div>

              {orderType === "LIMIT" && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Limit Price</label>
                  <input type="number" step="0.05" value={orderPrice} onChange={(e) => setOrderPrice(e.target.value)} placeholder="Enter limit price"
                    className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 cursor-text ${INTERACTION_CLASSES.formInput}`} />
                  <p className="text-xs text-gray-500 mt-1">Current: {INR}{currentLtp.toFixed(2)}</p>
                </div>
              )}
              {(orderType === "SL" || orderType === "SL-M") && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Trigger Price</label>
                  <input type="number" step="0.05" value={orderTrigger} onChange={(e) => setOrderTrigger(e.target.value)} placeholder="Enter trigger price"
                    className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 cursor-text ${INTERACTION_CLASSES.formInput}`} />
                </div>
              )}

              {!showNotes ? <button onClick={() => setShowNotes(true)} className="text-xs text-gray-500 hover:text-violet-400 cursor-pointer transition-colors duration-200">+ Add notes</button>
              : <textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Trade notes..." rows={2}
                  className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none cursor-text ${INTERACTION_CLASSES.formInput}`} />}

              {/* Bracket (SL / Target) + R:R + risk sizing — BUY only */}
              {isOption && selectedStrike && tradeType === "BUY" && currentLtp > 0 && (() => {
                const entry = effectivePrice;
                const sl = parseFloat(slPrice);
                const tgt = parseFloat(targetPrice);
                const hasSL = Number.isFinite(sl) && sl > 0;
                const hasTgt = Number.isFinite(tgt) && tgt > 0;
                const risk = hasSL ? entry - sl : null;
                const reward = hasTgt ? tgt - entry : null;
                const rr = risk && risk > 0 && reward != null ? reward / risk : null;
                return (
                  <div className="bg-gray-800 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-300">Bracket — auto SL &amp; target</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Stop-loss</label>
                        <input type="number" step="0.05" value={slPrice} onChange={(e) => setSlPrice(e.target.value)} placeholder={`< ${entry.toFixed(2)}`}
                          className={`w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-white placeholder-gray-600 ${INTERACTION_CLASSES.formInput}`} />
                        <div className="flex gap-1 mt-1">
                          {TRADE_CONFIG.bracketPresets.stopLossPercents.map((p) => (
                            <button key={p} onClick={() => setSlPrice((entry * (1 - p / 100)).toFixed(2))}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer active:scale-95 transition-all duration-200">-{p}%</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Target</label>
                        <input type="number" step="0.05" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} placeholder={`> ${entry.toFixed(2)}`}
                          className={`w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-white placeholder-gray-600 ${INTERACTION_CLASSES.formInput}`} />
                        <div className="flex gap-1 mt-1">
                          {TRADE_CONFIG.bracketPresets.targetPercents.map((p) => (
                            <button key={p} onClick={() => setTargetPrice((entry * (1 + p / 100)).toFixed(2))}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 cursor-pointer active:scale-95 transition-all duration-200">+{p}%</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                      {rr != null && <span className="text-gray-400">R:R <span className="text-white font-medium">1 : {rr.toFixed(2)}</span></span>}
                      {risk != null && risk > 0 && <span className="text-gray-400">Risk <span className="text-red-400 font-medium">{INR}{(risk * totalShares).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></span>}
                      {reward != null && reward > 0 && <span className="text-gray-400">Reward <span className="text-green-400 font-medium">{INR}{(reward * totalShares).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></span>}
                      {selectedDelta != null && <span className="text-gray-400">Prob. ITM <span className="text-white font-medium">{formatPercent(Math.abs(selectedDelta) * 100)}</span></span>}
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] text-gray-500 mb-0.5">Risk budget ({INR})</label>
                        <input type="number" value={riskAmount} onChange={(e) => setRiskAmount(e.target.value)} placeholder="e.g. 2000"
                          className={`w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-white placeholder-gray-600 ${INTERACTION_CLASSES.formInput}`} />
                      </div>
                      <button onClick={applyRiskSizing} disabled={!hasSL}
                        className="text-xs px-3 py-1.5 rounded-md border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 cursor-pointer active:scale-95 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed">
                        Size by risk
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-600">SL/Target attach to the position and auto-close (whichever hits first) from the Positions page.</p>
                  </div>
                );
              })()}

              {/* Breakeven, max P&L, POP, payoff (expiry + today) */}
              {isOption && selectedStrike && currentLtp > 0 && (() => {
                const premium = effectivePrice;
                const side: "CE" | "PE" = instrumentType === "PE" ? "PE" : "CE";
                const be = side === "CE" ? selectedStrike + premium : selectedStrike - premium;
                const longCapped = side === "CE" ? Infinity : (selectedStrike - premium) * totalShares;
                const maxProfit = tradeType === "BUY" ? longCapped : premium * totalShares;
                const maxLoss = tradeType === "BUY" ? premium * totalShares : longCapped;
                const fmtMoney = (v: number) =>
                  v === Infinity ? "Unlimited" : `${INR}${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

                // Inputs for the BS "today" curve and POP.
                const row = chain.find((r) => r.strike_price === selectedStrike);
                const iv = ((side === "PE" ? row?.pe.iv : row?.ce.iv) ?? 0) / 100;
                const S0 = quote?.last_price ?? selectedStrike;
                const T = yearsToExpiry(selectedExpiry);
                const dirMul = tradeType === "BUY" ? 1 : -1;
                const intrinsicAt = (s: number) => (side === "CE" ? Math.max(0, s - selectedStrike) : Math.max(0, selectedStrike - s));
                const lo = selectedStrike * 0.9;
                const hi = selectedStrike * 1.1;
                const steps = 25;
                const data: { s: number; expiry: number; t0: number }[] = [];
                for (let i = 0; i < steps; i++) {
                  const s = lo + ((hi - lo) * i) / (steps - 1);
                  const expiryPnl = dirMul * (intrinsicAt(s) - premium) * totalShares;
                  const t0Pnl = dirMul * (bsPrice(side, s, selectedStrike, T, iv) - premium) * totalShares;
                  data.push({ s: Math.round(s), expiry: Math.round(expiryPnl), t0: Math.round(t0Pnl) });
                }
                const pop = iv > 0 && S0 > 0 ? probOfProfit((s) => dirMul * (intrinsicAt(s) - premium), S0, iv, T) : null;
                return (
                  <div className="bg-gray-800 rounded-lg p-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-2">
                      <div><p className="text-gray-500">Breakeven</p><p className="text-white font-medium">{INR}{be.toFixed(2)}</p></div>
                      <div><p className="text-gray-500">Max profit</p><p className="text-green-400 font-medium">{fmtMoney(maxProfit)}</p></div>
                      <div><p className="text-gray-500">Max loss</p><p className="text-red-400 font-medium">{fmtMoney(maxLoss)}</p></div>
                      <div><p className="text-gray-500">Prob. of profit</p><p className="text-white font-medium">{pop == null ? "—" : formatPercent(pop)}</p></div>
                    </div>
                    <div className="h-32 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                          <XAxis dataKey="s" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                          <Tooltip
                            formatter={(v, n) => [`${INR}${Number(v).toLocaleString("en-IN")}`, n === "t0" ? "Today" : "At expiry"]}
                            labelFormatter={(l) => `Underlying ${l}`}
                            contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 }}
                          />
                          <ReferenceLine y={0} stroke="#4b5563" />
                          <Line type="monotone" dataKey="t0" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                          <Line type="monotone" dataKey="expiry" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1"><span className="text-violet-400">━</span> At expiry · <span className="text-amber-500">┄</span> Today (T+0)</p>
                  </div>
                );
              })()}

              {/* Summary */}
              <div className="bg-gray-800 rounded-lg p-3 space-y-1.5">
                {[
                  ["Qty", isOption ? `${orderQty} lot (${totalShares})` : `${totalShares} shares`],
                  ["Price", `${INR}${effectivePrice.toFixed(2)} ${orderType === "MARKET" ? "(Mkt)" : ""}`],
                  ["Value", `${INR}${grossValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`],
                  ["Charges", `${INR}${charges.toFixed(2)}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-xs text-gray-400">{k}</span><span className="text-sm text-white">{v}</span></div>
                ))}
                {estFill?.charges && (
                  <p className="text-[10px] text-gray-500 leading-tight">
                    Incl. brokerage {INR}{estFill.charges.brokerage.toFixed(0)}, STT {INR}{estFill.charges.stt.toFixed(2)}, txn+SEBI+stamp+GST {INR}{(estFill.charges.txn + estFill.charges.sebi + estFill.charges.stamp + estFill.charges.gst).toFixed(2)}
                  </p>
                )}
                {isWritingSell && (
                  <div className="flex justify-between"><span className="text-xs text-amber-400/80">Margin blocked (est.)</span><span className="text-sm text-amber-400">{INR}{shortMarginEst.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>
                )}
                <div className="flex justify-between border-t border-gray-700 pt-1.5 mt-1"><span className="text-xs text-gray-400 font-medium">Total</span><span className="text-sm font-bold text-white">{INR}{totalValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between"><span className="text-xs text-gray-400">Balance</span><span className="text-sm text-white">{INR}{virtualCash.toLocaleString("en-IN")}</span></div>
                <div className="flex justify-between"><span className="text-xs text-gray-400">After</span><span className={`text-sm font-medium ${canAfford ? "text-green-400" : "text-red-400"}`}>{INR}{cashAfter.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>
                {!canAfford && <p className="text-red-400 text-xs">Insufficient funds</p>}
              </div>

              {/* Fast mode */}
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fastMode}
                  onChange={(e) => {
                    setFastMode(e.target.checked);
                    localStorage.setItem("ts_fast_mode", e.target.checked ? "1" : "0");
                  }}
                  className="w-3.5 h-3.5 rounded cursor-pointer"
                />
                {"⚡"} Fast mode — place instantly without confirmation
              </label>
              <p className="text-[10px] text-gray-600 -mt-1">Shortcuts: <span className="text-gray-400">B</span>/<span className="text-gray-400">S</span> side · <span className="text-gray-400">↑↓</span> qty · <span className="text-gray-400">Enter</span> place</p>

              {/* Place / Confirm */}
              <div ref={placeOrderRef}>
                {!confirmStep ? (
                  <button onClick={() => (fastMode ? handlePlaceOrder() : setConfirmStep(true))} disabled={placing || !canAfford || currentLtp <= 0}
                    className={`w-full py-3 rounded-xl text-base font-semibold cursor-pointer transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${tradeType === "BUY" ? "bg-green-500 hover:bg-green-400 text-white" : "bg-red-500 hover:bg-red-400 text-white"}`}>
                    {placing ? "Placing..." : `${fastMode ? "⚡ " : ""}Place ${tradeType} Order`}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400 text-center">Confirm your order:</p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmStep(false)} className={`${INTERACTION_CLASSES.secondaryButton} flex-1 text-sm text-gray-300 py-2.5 rounded-lg`}>Cancel</button>
                      <button onClick={handlePlaceOrder} disabled={placing}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold cursor-pointer transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${tradeType === "BUY" ? "bg-green-500 hover:bg-green-400 text-white" : "bg-red-500 hover:bg-red-400 text-white"}`}>
                        {placing ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Executing...</span> : "Confirm & Execute"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              </div>
              </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ---------------- Strategy Builder ----------------
interface StrategyLeg { id: number; action: "BUY" | "SELL"; side: "CE" | "PE"; strike: number; lots: number; expiry: string }
let legIdCounter = 0;

// Resolves the chain for a leg's own expiry (calendar spreads span expiries).
type ChainFor = (expiry: string) => OptionChainData[];

function legPremium(leg: StrategyLeg, chainFor: ChainFor): number {
  const row = chainFor(leg.expiry).find((r) => r.strike_price === leg.strike);
  if (!row) return 0;
  return leg.side === "CE" ? row.ce.ltp : row.pe.ltp;
}

function legIv(leg: StrategyLeg, chainFor: ChainFor): number {
  const row = chainFor(leg.expiry).find((r) => r.strike_price === leg.strike);
  if (!row) return 0;
  return (leg.side === "CE" ? row.ce.iv : row.pe.iv) / 100;
}

// Combined strategy P&L across the underlying range, plus the BS "today" (T+0)
// curve and probability of profit. The "expiry" curve is evaluated at the
// NEAREST leg's expiry: legs expiring then settle to intrinsic; longer-dated
// legs (calendar/diagonal) still carry time value, priced via Black-Scholes for
// the time remaining. `isMultiExpiry` flags that to the caller.
function strategyMetrics(legs: StrategyLeg[], chainFor: ChainFor, lotSize: number, underlying: number) {
  if (legs.length === 0) return null;
  const strikes = legs.map((l) => l.strike);
  const lo = Math.min(...strikes) * 0.8;
  const hi = Math.max(...strikes) * 1.2;
  const steps = 60;
  const nearExpiry = legs.map((l) => l.expiry).sort()[0];
  const isMultiExpiry = legs.some((l) => l.expiry !== nearExpiry);

  // Value a leg at the near expiry: intrinsic if it's also expiring, else BS for
  // the time between near and its own expiry.
  const valueAtNear = (leg: StrategyLeg, s: number) => {
    const tRem = leg.expiry === nearExpiry ? 0 : yearsBetween(nearExpiry, leg.expiry);
    if (tRem <= 0) return leg.side === "CE" ? Math.max(0, s - leg.strike) : Math.max(0, leg.strike - s);
    return bsPrice(leg.side, s, leg.strike, tRem, legIv(leg, chainFor));
  };
  const expiryPnlAt = (s: number) => {
    let pnl = 0;
    for (const leg of legs) {
      const prem = legPremium(leg, chainFor);
      const val = valueAtNear(leg, s);
      pnl += (leg.action === "BUY" ? val - prem : prem - val) * leg.lots * lotSize;
    }
    return pnl;
  };
  const t0PnlAt = (s: number) => {
    let pnl = 0;
    for (const leg of legs) {
      const prem = legPremium(leg, chainFor);
      const val = bsPrice(leg.side, s, leg.strike, yearsToExpiry(leg.expiry), legIv(leg, chainFor));
      pnl += (leg.action === "BUY" ? val - prem : prem - val) * leg.lots * lotSize;
    }
    return pnl;
  };

  const points: { s: number; pnl: number; t0: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const s = lo + ((hi - lo) * i) / (steps - 1);
    points.push({ s: Math.round(s), pnl: Math.round(expiryPnlAt(s)), t0: Math.round(t0PnlAt(s)) });
  }
  let netPremium = 0;
  for (const leg of legs) {
    netPremium += (leg.action === "BUY" ? -legPremium(leg, chainFor) : legPremium(leg, chainFor)) * leg.lots * lotSize;
  }
  const n = points.length;
  const rightSlope = points[n - 1].pnl - points[n - 2].pnl;
  const leftSlope = points[0].pnl - points[1].pnl;
  const maxProfit = rightSlope > 0.5 || leftSlope > 0.5 ? Infinity : Math.max(...points.map((p) => p.pnl));
  const maxLoss = rightSlope < -0.5 || leftSlope < -0.5 ? -Infinity : Math.min(...points.map((p) => p.pnl));
  const breakevens: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if ((a.pnl <= 0 && b.pnl > 0) || (a.pnl >= 0 && b.pnl < 0)) {
      const t = Math.abs(a.pnl) / (Math.abs(a.pnl) + Math.abs(b.pnl) || 1);
      breakevens.push(Math.round(a.s + (b.s - a.s) * t));
    }
  }
  // POP at the near expiry, using the ATM leg's IV as the underlying vol proxy.
  const atmIv = legIv(legs[0], chainFor) || 0;
  const pop = atmIv > 0 && underlying > 0 ? probOfProfit(expiryPnlAt, underlying, atmIv, yearsToExpiry(nearExpiry)) : null;
  return { points, netPremium, maxProfit, maxLoss, breakevens, pop, isMultiExpiry, nearExpiry };
}

const STRATEGY_TEMPLATES = [
  { key: "straddle", label: "Long Straddle" },
  { key: "strangle", label: "Long Strangle" },
  { key: "bullcall", label: "Bull Call" },
  { key: "bearput", label: "Bear Put" },
  { key: "ironcondor", label: "Iron Condor" },
  { key: "butterfly", label: "Call Butterfly" },
  { key: "calendar", label: "Calendar (CE)" }, // needs a 2nd expiry
];

// `near` is the primary expiry; `far` (optional) is the next one, used by the
// calendar template's long leg. All other templates are single-expiry (near).
function buildTemplate(key: string, atm: number, chain: OptionChainData[], near: string, far: string | null): StrategyLeg[] {
  const strikes = chain.map((r) => r.strike_price).sort((a, b) => a - b);
  const idx = strikes.indexOf(atm);
  if (idx < 0) return [];
  const at = (off: number): number | undefined => strikes[idx + off];
  const L = (action: "BUY" | "SELL", side: "CE" | "PE", strike: number | undefined, exp: string, lots = 1): StrategyLeg | null =>
    strike == null ? null : { id: (legIdCounter += 1), action, side, strike, lots, expiry: exp };
  let legs: (StrategyLeg | null)[] = [];
  switch (key) {
    case "straddle": legs = [L("BUY", "CE", at(0), near), L("BUY", "PE", at(0), near)]; break;
    case "strangle": legs = [L("BUY", "CE", at(1), near), L("BUY", "PE", at(-1), near)]; break;
    case "bullcall": legs = [L("BUY", "CE", at(0), near), L("SELL", "CE", at(1), near)]; break;
    case "bearput": legs = [L("BUY", "PE", at(0), near), L("SELL", "PE", at(-1), near)]; break;
    // Longs first so the engine sees the protective wing when the short places
    // (enables spread margin instead of naked margin).
    case "ironcondor": legs = [L("BUY", "PE", at(-2), near), L("SELL", "PE", at(-1), near), L("BUY", "CE", at(2), near), L("SELL", "CE", at(1), near)]; break;
    case "butterfly": legs = [L("BUY", "CE", at(-1), near), L("BUY", "CE", at(1), near), L("SELL", "CE", at(0), near), L("SELL", "CE", at(0), near)]; break;
    // Calendar: sell the near ATM call, buy the same strike in the next expiry.
    case "calendar": legs = far ? [L("SELL", "CE", at(0), near), L("BUY", "CE", at(0), far)] : []; break;
  }
  return legs.filter((l): l is StrategyLeg => l !== null);
}

function StrategyBuilder({
  chain,
  chainsByExpiry,
  expiries,
  loadChainFor,
  atmStrike,
  lotSize,
  symbol,
  expiry,
  exchange,
  userId,
}: {
  chain: OptionChainData[];
  chainsByExpiry: Record<string, OptionChainData[]>;
  expiries: string[];
  loadChainFor: (expiry: string) => void;
  atmStrike: number;
  lotSize: number;
  symbol: string;
  expiry: string | null;
  exchange: string;
  userId: string;
}) {
  const [legs, setLegs] = useState<StrategyLeg[]>([]);
  const [placingStrategy, setPlacingStrategy] = useState(false);
  // Resolve each leg's expiry to its own (cached) chain; fall back to the
  // primary chain for the selected expiry.
  const chainFor = useCallback(
    (exp: string): OptionChainData[] => chainsByExpiry[exp] ?? (exp === expiry ? chain : []),
    [chainsByExpiry, expiry, chain]
  );
  const metrics = strategyMetrics(legs, chainFor, lotSize, atmStrike);
  const hasShort = legs.some((l) => l.action === "SELL");
  const farExpiry = expiries.find((e) => e !== expiry) ?? null;

  // Ensure a chain is loaded whenever a leg references an expiry we haven't cached.
  useEffect(() => {
    for (const l of legs) if (l.expiry && !chainsByExpiry[l.expiry]) loadChainFor(l.expiry);
  }, [legs, chainsByExpiry, loadChainFor]);

  async function placeStrategy() {
    if (!userId || legs.length === 0) return;
    setPlacingStrategy(true);

    // Place legs sequentially, tracking what filled. If ANY leg fails, unwind the
    // already-placed legs (opposite MARKET order each) so the strategy is
    // effectively all-or-nothing — no partial position with naked-leg risk.
    const placed: { leg: (typeof legs)[number]; qty: number }[] = [];
    let failReason: string | null = null;

    for (const leg of legs) {
      if (!leg.expiry) { failReason = "a leg is missing its expiry"; break; }
      const qty = leg.lots * lotSize;
      const res = await placeOrder(userId, {
        symbol,
        exchange,
        instrument_type: leg.side,
        option_type: leg.side,
        strike_price: leg.strike,
        expiry_date: leg.expiry,
        lot_size: lotSize,
        order_type: "MARKET",
        trade_type: leg.action,
        quantity: qty,
        price: null,
        trigger_price: null,
        notes: "Strategy",
      });
      if (res.success) placed.push({ leg, qty });
      else { failReason = res.message; break; }
    }

    if (failReason) {
      for (const p of placed) {
        await placeOrder(userId, {
          symbol,
          exchange,
          instrument_type: p.leg.side,
          option_type: p.leg.side,
          strike_price: p.leg.strike,
          expiry_date: p.leg.expiry,
          lot_size: lotSize,
          order_type: "MARKET",
          trade_type: p.leg.action === "BUY" ? "SELL" : "BUY",
          quantity: p.qty,
          price: null,
          trigger_price: null,
          notes: "Strategy rollback",
        });
      }
      setPlacingStrategy(false);
      showToast(
        `Strategy not placed — ${failReason}.${placed.length ? ` Rolled back ${placed.length} placed leg(s).` : ""}`,
        "error"
      );
      return;
    }

    setPlacingStrategy(false);
    showToast(`Strategy placed (${legs.length} leg${legs.length > 1 ? "s" : ""})`, "success");
    window.location.assign(`/dashboard/positions?highlight=${encodeURIComponent(symbol)}`);
  }
  const fmtMoney = (v: number) =>
    Math.abs(v) === Infinity ? "Unlimited" : `${INR}${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  if (chain.length === 0 || !expiry) {
    return <p className="text-sm text-gray-500 text-center py-6">Select an expiry to load strikes.</p>;
  }
  const multiExpiry = expiries.length > 1;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-gray-400 mb-1.5">Templates</p>
        <div className="flex flex-wrap gap-1.5">
          {STRATEGY_TEMPLATES.filter((t) => t.key !== "calendar" || multiExpiry).map((t) => (
            <button key={t.key} onClick={() => setLegs(buildTemplate(t.key, atmStrike, chain, expiry, farExpiry))}
              className="text-[11px] px-2 py-1 rounded-md bg-gray-800 text-gray-300 hover:bg-violet-500/20 hover:text-violet-300 cursor-pointer active:scale-95 transition-all duration-200">
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {legs.map((leg) => {
          const legStrikes = chainFor(leg.expiry).map((r) => r.strike_price).sort((a, b) => a - b);
          return (
          <div key={leg.id} className="flex items-center gap-1.5 text-xs flex-wrap">
            <button onClick={() => setLegs((ls) => ls.map((l) => (l.id === leg.id ? { ...l, action: l.action === "BUY" ? "SELL" : "BUY" } : l)))}
              className={`px-2 py-1 rounded-md font-semibold w-12 cursor-pointer ${leg.action === "BUY" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{leg.action}</button>
            <button onClick={() => setLegs((ls) => ls.map((l) => (l.id === leg.id ? { ...l, side: l.side === "CE" ? "PE" : "CE" } : l)))}
              className={`px-2 py-1 rounded-md font-semibold w-10 cursor-pointer ${leg.side === "CE" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>{leg.side}</button>
            <select value={leg.strike} onChange={(e) => setLegs((ls) => ls.map((l) => (l.id === leg.id ? { ...l, strike: Number(e.target.value) } : l)))}
              className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-white cursor-pointer">
              {legStrikes.map((s) => <option key={s} value={s}>{s.toLocaleString("en-IN")}</option>)}
            </select>
            {multiExpiry && (
              <select value={leg.expiry} onChange={(e) => setLegs((ls) => ls.map((l) => (l.id === leg.id ? { ...l, expiry: e.target.value } : l)))}
                className="bg-gray-800 border border-gray-700 rounded-md px-1.5 py-1 text-white cursor-pointer" title="Leg expiry (calendar/diagonal)">
                {expiries.map((e) => <option key={e} value={e}>{fmtExpiryShort(e)}</option>)}
              </select>
            )}
            <input type="number" min={1} value={leg.lots} onChange={(e) => setLegs((ls) => ls.map((l) => (l.id === leg.id ? { ...l, lots: Math.max(1, parseInt(e.target.value, 10) || 1) } : l)))}
              className="w-14 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-white" />
            <span className="text-gray-500">@{INR}{legPremium(leg, chainFor).toFixed(1)}</span>
            <button onClick={() => setLegs((ls) => ls.filter((l) => l.id !== leg.id))} className="text-red-400 hover:text-red-300 cursor-pointer ml-auto px-1" aria-label="Remove leg">✕</button>
          </div>
          );
        })}
        <button onClick={() => setLegs((ls) => [...ls, { id: (legIdCounter += 1), action: "BUY", side: "CE", strike: atmStrike, lots: 1, expiry: expiry }])}
          className="text-[11px] text-violet-400 hover:text-violet-300 cursor-pointer">+ Add leg</button>
      </div>

      {metrics && legs.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs mb-2">
            <div><p className="text-gray-500">{metrics.netPremium >= 0 ? "Net credit" : "Net debit"}</p><p className="text-white font-medium">{INR}{Math.abs(metrics.netPremium).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p></div>
            <div><p className="text-gray-500">Max profit</p><p className="text-green-400 font-medium">{fmtMoney(metrics.maxProfit)}</p></div>
            <div><p className="text-gray-500">Max loss</p><p className="text-red-400 font-medium">{fmtMoney(metrics.maxLoss)}</p></div>
            <div><p className="text-gray-500">Breakeven</p><p className="text-white font-medium">{metrics.breakevens.length ? metrics.breakevens.join(", ") : "—"}</p></div>
            <div><p className="text-gray-500">Prob. of profit</p><p className="text-white font-medium">{metrics.pop == null ? "—" : formatPercent(metrics.pop)}</p></div>
          </div>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={metrics.points} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="s" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                <Tooltip formatter={(v, n) => [`${INR}${Number(v).toLocaleString("en-IN")}`, n === "t0" ? "Today" : "At expiry"]} labelFormatter={(l) => `Underlying ${l}`} contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 }} />
                <ReferenceLine y={0} stroke="#4b5563" />
                <Line type="monotone" dataKey="t0" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                <Line type="monotone" dataKey="pnl" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-gray-600 mt-1">
            <span className="text-violet-400">━</span> {metrics.isMultiExpiry && metrics.nearExpiry ? `At ${fmtExpiryShort(metrics.nearExpiry)} (near leg; longer legs BS-valued)` : "At expiry"} · <span className="text-amber-500">┄</span> Today (T+0)
          </p>
          <button
            onClick={placeStrategy}
            disabled={placingStrategy || !userId}
            className={`${INTERACTION_CLASSES.primaryButton} w-full mt-2 py-2.5 rounded-lg text-sm font-semibold text-white`}
          >
            {placingStrategy ? "Placing…" : `Place strategy (${legs.length} leg${legs.length > 1 ? "s" : ""})`}
          </button>
          {hasShort && (
            <p className="text-[10px] text-gray-500 mt-1">
              Short legs are written (sold-to-open) and block margin per leg — the
              sim charges margin leg-by-leg, so defined-risk spreads tie up more
              than a real broker&apos;s spread margin.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function IndexQuickCard({ data, label, source, onTrade, exchange = "NSE" }: { data: MarketData | null; label: string; source: string; onTrade: () => void; exchange?: string }) {
  return (
    <button onClick={onTrade} className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-5 text-left cursor-pointer hover:border-violet-500/30 hover:-translate-y-1 transition-all duration-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2"><span className="text-sm font-bold text-white">{label}</span><span className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">{exchange}</span></div>
        <LiveBadge source={source as "dhan" | "upstox" | "demo"} lastUpdated={data?.last_updated ?? null} />
      </div>
      {data ? (
        <>
          <p className="text-3xl font-bold text-white">{"\u20B9"}{data.last_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-sm ${getPnLColor(data.change)}`}>{data.change >= 0 ? "+" : ""}{data.change.toFixed(2)} ({data.change_percent.toFixed(2)}%)</span>
            <span className="text-xs text-violet-400">Tap to trade &rarr;</span>
          </div>
        </>
      ) : <div className="animate-pulse"><div className="h-9 w-40 bg-gray-800 rounded mt-1" /><div className="h-4 w-28 bg-gray-800 rounded mt-2" /></div>}
    </button>
  );
}

function fmtExpiry(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Compact expiry for quick-tab chips, e.g. "26 Jun".
function fmtExpiryShort(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function isMonthlyExpiry(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const lastDayOfWeek = lastDay.getDay();
  const diff = (lastDayOfWeek - 4 + 7) % 7;
  const lastThursday = new Date(lastDay);
  lastThursday.setDate(lastDay.getDate() - diff);
  return d.getDate() === lastThursday.getDate() && d.getMonth() === lastThursday.getMonth();
}
