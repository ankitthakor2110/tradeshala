"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useIsMounted } from "@/hooks/useIsMounted";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { getCurrentUser } from "@/services/auth.service";
import { searchStocks, getStockQuote, getIndicesData } from "@/services/market-data.service";
import { TRADE_CONFIG } from "@/config/trade";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import { getPnLColor } from "@/utils/colors";
import { formatOI, formatPercent } from "@/utils/format";
import {
  ComposedChart,
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
import type { MarketData, OptionChainData, OrderFormData } from "@/types/database";

const INR = "\u20B9";

const STRIKE_GAP: Record<string, number> = { NIFTY: 50, BANKNIFTY: 100, FINNIFTY: 50, SENSEX: 100 };

function calcAtm(price: number, symbol: string): number {
  const gap = STRIKE_GAP[symbol] ?? 5;
  return Math.round(price / gap) * gap;
}

// P&L at expiry for a single option leg across a range of underlying prices.
function optionPayoff(
  side: "CE" | "PE",
  tradeType: "BUY" | "SELL",
  strike: number,
  premium: number,
  totalQty: number
): { s: number; pnl: number }[] {
  if (!strike || totalQty <= 0) return [];
  const lo = strike * 0.9;
  const hi = strike * 1.1;
  const steps = 25;
  const pts: { s: number; pnl: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const s = lo + ((hi - lo) * i) / (steps - 1);
    const intrinsic = side === "CE" ? Math.max(0, s - strike) : Math.max(0, strike - s);
    const longPnl = (intrinsic - premium) * totalQty;
    pts.push({ s: Math.round(s), pnl: Math.round(tradeType === "BUY" ? longPnl : -longPnl) });
  }
  return pts;
}

function filterStrikes(chain: OptionChainData[], atm: number, symbol: string): OptionChainData[] {
  const gap = STRIKE_GAP[symbol] ?? 5;
  const strikes: number[] = [];
  for (let i = -5; i <= 5; i++) strikes.push(atm + i * gap);
  return chain.filter((r) => strikes.includes(r.strike_price)).sort((a, b) => a.strike_price - b.strike_price);
}

interface SearchResult { symbol: string; company_name: string; exchange: string }
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
  const [chain, setChain] = useState<OptionChainData[]>([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [atmStrike, setAtmStrike] = useState(0);
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [selectedOptionLtp, setSelectedOptionLtp] = useState<number | null>(null);
  const [selectedSide, setSelectedSide] = useState<"CE" | "PE">("CE");
  const [flashStrike, setFlashStrike] = useState<number | null>(null);
  const [visibleCols, setVisibleCols] = useState({ oi: true, oiChg: false, vol: false, iv: true, delta: false, bidAsk: false });
  const [showColMenu, setShowColMenu] = useState(false);

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
    if (!modalOpen || instrumentType === "EQ") { setExpiries([]); setSelectedExpiry(null); setChain([]); setSelectedStrike(null); setSelectedOptionLtp(null); return; }
    fetch(`/api/trade/expiries?symbol=${encodeURIComponent(selectedSymbol)}`).then((r) => r.json()).then((d) => { const l: string[] = d.expiries ?? []; setExpiries(l); if (l.length) setSelectedExpiry(l[0]); }).catch(() => setExpiries([]));
  }, [modalOpen, selectedSymbol, instrumentType]);

  useEffect(() => {
    if (!selectedSymbol || !selectedExpiry || instrumentType === "EQ") return;
    setChainLoading(true);
    fetch(`/api/trade/option-chain?symbol=${encodeURIComponent(selectedSymbol)}&expiry=${encodeURIComponent(selectedExpiry)}`)
      .then((r) => r.json())
      .then((d) => {
        const fullChain: OptionChainData[] = d.chain ?? [];
        const underlying = d.underlyingPrice ?? quote?.last_price ?? 0;
        const atm = calcAtm(underlying, selectedSymbol);
        setAtmStrike(atm);
        const filtered = filterStrikes(fullChain, atm, selectedSymbol);
        setChain(filtered);
        // Smart default: preselect the ATM strike when nothing is chosen yet.
        if (selectedStrike === null) {
          const atmRow = filtered.find((r) => r.strike_price === atm);
          if (atmRow) {
            const side = instrumentType === "PE" ? "PE" : "CE";
            setSelectedStrike(atm);
            setSelectedSide(side);
            setSelectedOptionLtp(side === "PE" ? atmRow.pe.ltp : atmRow.ce.ltp);
          }
        }
        setChainLoading(false);
      })
      .catch(() => { setChain([]); setChainLoading(false); });
    // selectedStrike is read only to auto-select once; re-running on it would
    // refetch the chain on every strike click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol, selectedExpiry, instrumentType, quote?.last_price]);

  function openTradeModal(symbol: string, name: string, exchange: string) {
    setSelectedSymbol(symbol); setSelectedName(name); setSelectedExchange(exchange);
    setInstrumentType("CE"); setTradeType("BUY"); setOrderType("MARKET"); setOrderQty(1);
    setOrderPrice(""); setOrderTrigger(""); setOrderNotes(""); setShowNotes(false);
    setSlPrice(""); setTargetPrice(""); setRiskAmount(""); setTradeMode("single");
    setConfirmStep(false); setOrderSuccess(null); setQuote(null);
    setSelectedStrike(null); setSelectedOptionLtp(null); setSelectedSide("CE"); setFlashStrike(null);
    setModalOpen(true); fetchQuote(symbol, exchange);
  }

  function handleStrikeSelect(strike: number, ltp: number, side: "CE" | "PE") {
    setSelectedStrike(strike); setSelectedOptionLtp(ltp); setInstrumentType(side); setSelectedSide(side);
    setSlPrice(""); setTargetPrice("");
    setFlashStrike(strike);
    setTimeout(() => setFlashStrike(null), 300);
    setTimeout(() => placeOrderRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 200);
  }

  const lotSize = TRADE_CONFIG.defaultLotSizes[selectedSymbol] ?? 1;
  const isOption = instrumentType !== "EQ";
  const currentLtp = isOption && selectedOptionLtp ? selectedOptionLtp : (quote?.last_price ?? 0);
  const effectivePrice = orderType === "LIMIT" && orderPrice ? parseFloat(orderPrice) : currentLtp;
  const totalShares = isOption ? orderQty * lotSize : orderQty;

  const selectedDelta = useMemo(() => {
    if (!selectedStrike) return null;
    const row = chain.find((r) => r.strike_price === selectedStrike);
    if (!row) return null;
    return selectedSide === "PE" ? row.pe.delta : row.ce.delta;
  }, [chain, selectedStrike, selectedSide]);

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
  const cashAfter = tradeType === "BUY" ? virtualCash - totalValue : virtualCash + grossValue - charges;
  const canAfford = tradeType === "BUY" ? cashAfter >= 0 : true;

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
      setVirtualCash((p) => tradeType === "BUY" ? p - totalValue : p + grossValue - charges);
      setOrderSuccess({ msg: `${tradeType === "BUY" ? "Bought" : "Sold"} ${isOption ? `${orderQty} lot` : `${totalShares} shares`} of ${selectedSymbol}${isOption && selectedStrike ? ` ${selectedStrike} ${instrumentType}` : ""} at ${INR}${(result.fill?.executed_price ?? effectivePrice).toFixed(2)}`, detail: tradeType === "BUY" ? `${INR}${totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })} deducted` : `${INR}${(grossValue - charges).toLocaleString("en-IN", { maximumFractionDigits: 0 })} credited` });
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
    <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
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

      {/* Default — index cards */}
      {!query.trim() && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <IndexQuickCard data={nifty} label="NIFTY 50" source={ls} onTrade={() => openTradeModal("NIFTY", "Nifty 50", "NSE")} />
            <IndexQuickCard data={bankNifty} label="BANK NIFTY" source={ls} onTrade={() => openTradeModal("BANKNIFTY", "Bank Nifty", "NSE")} />
            <IndexQuickCard data={sensex} label="SENSEX" source={ls} exchange="BSE" onTrade={() => openTradeModal("SENSEX", "Sensex", "BSE")} />
          </div>
          <p className="text-center text-xs text-gray-600">Or search for any stock or index above</p>
        </>
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

      {/* Trade Modal */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setOrderSuccess(null); setConfirmStep(false); }} title={`${selectedSymbol} — Place Order`}>
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
                  atmStrike={atmStrike}
                  lotSize={lotSize}
                  symbol={selectedSymbol}
                  expiry={selectedExpiry}
                  exchange={selectedExchange}
                  userId={userId}
                  onPlaced={() => { reloadBalance(); setModalOpen(false); }}
                />
              )}

              {tradeMode === "single" && (
              <>
              {/* Option chain — rich table */}
              {isOption && (chainLoading ? (
                <div className="space-y-1.5 animate-pulse">{[...Array(6)].map((_, i) => <div key={i} className="h-9 bg-gray-800 rounded-lg" />)}</div>
              ) : chain.length > 0 ? (
                <div>
                  {/* Column toggle */}
                  <div className="flex justify-end mb-1.5 relative">
                    <button onClick={() => setShowColMenu(!showColMenu)} className="text-[10px] text-gray-500 hover:text-violet-400 cursor-pointer transition-colors duration-200">Columns {"\u25BE"}</button>
                    {showColMenu && (
                      <div className="absolute right-0 top-5 z-50 bg-gray-800 border border-gray-700 rounded-lg p-2 shadow-xl space-y-1">
                        {(Object.keys(visibleCols) as (keyof typeof visibleCols)[]).map((col) => (
                          <label key={col} className="flex items-center gap-2 text-[10px] text-gray-300 cursor-pointer hover:text-white">
                            <input type="checkbox" checked={visibleCols[col]} onChange={() => setVisibleCols((p) => ({ ...p, [col]: !p[col] }))} className="w-3 h-3 rounded cursor-pointer" />
                            {({ oi: "OI", oiChg: "OI Change", vol: "Volume", iv: "IV", delta: "Delta", bidAsk: "Bid/Ask" })[col]}
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
                          {visibleCols.delta && <th className="py-1.5 px-1.5 text-right text-green-400 bg-green-500/5" title="Rate of change vs underlying price">{"\u0394"}</th>}
                          {visibleCols.bidAsk && <th className="py-1.5 px-1.5 text-right text-green-400 bg-green-500/5">B/A</th>}
                          <th className="py-1.5 px-1.5 text-right text-green-400 bg-green-500/5 font-bold">CE</th>
                          <th className="py-1.5 px-2 text-center text-violet-400 bg-violet-500/5 font-bold sticky left-0 bg-gray-900 z-10">STRIKE</th>
                          <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5 font-bold">PE</th>
                          {visibleCols.bidAsk && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5">B/A</th>}
                          {visibleCols.delta && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5">{"\u0394"}</th>}
                          {visibleCols.iv && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5">IV</th>}
                          {visibleCols.vol && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5">VOL</th>}
                          {visibleCols.oiChg && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5">OI CHG</th>}
                          {visibleCols.oi && <th className="py-1.5 px-1.5 text-left text-red-400 bg-red-500/5">OI</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {chain.map((row) => {
                          const isAtm = row.strike_price === atmStrike;
                          const isSel = row.strike_price === selectedStrike;
                          const isFlash = row.strike_price === flashStrike;
                          const maxOi = Math.max(...chain.map((r) => Math.max(r.ce.oi, r.pe.oi)), 1);
                          const maxPainStrike = chain.reduce((a, b) => (a.ce.oi + a.pe.oi > b.ce.oi + b.pe.oi ? a : b)).strike_price;
                          const isMaxPain = row.strike_price === maxPainStrike;
                          const pcrBg = row.pcr > 1.2 ? "bg-green-500/20 text-green-400" : row.pcr < 0.8 ? "bg-red-500/20 text-red-400" : "bg-gray-500/20 text-gray-400";
                          const ivColor = (iv: number) => iv > 20 ? "text-red-400" : iv > 16 ? "text-orange-400" : iv > 12 ? "text-yellow-400" : "text-green-400";
                          const dColor = (d: number) => Math.abs(d) > 0.5 ? (d > 0 ? "text-green-400" : "text-red-400") : Math.abs(d) > 0.3 ? "text-yellow-400" : "text-gray-500";

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
                                <td className={`py-1.5 px-1.5 text-right ${row.ce.oiChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                                  {row.ce.oiChange >= 0 ? "\u2191" : "\u2193"}{formatOI(Math.abs(row.ce.oiChange))}
                                </td>
                              )}
                              {visibleCols.vol && <td className="py-1.5 px-1.5 text-right text-gray-500">{formatOI(row.ce.volume)}</td>}
                              {visibleCols.iv && <td className={`py-1.5 px-1.5 text-right ${ivColor(row.ce.iv)}`}>{row.ce.iv.toFixed(1)}</td>}
                              {visibleCols.delta && <td className={`py-1.5 px-1.5 text-right ${dColor(row.ce.delta)}`}>{row.ce.delta.toFixed(2)}</td>}
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
                              {visibleCols.delta && <td className={`py-1.5 px-1.5 text-left ${dColor(row.pe.delta)}`}>{row.pe.delta.toFixed(2)}</td>}
                              {visibleCols.iv && <td className={`py-1.5 px-1.5 text-left ${ivColor(row.pe.iv)}`}>{row.pe.iv.toFixed(1)}</td>}
                              {visibleCols.vol && <td className="py-1.5 px-1.5 text-left text-gray-500">{formatOI(row.pe.volume)}</td>}
                              {visibleCols.oiChg && (
                                <td className={`py-1.5 px-1.5 text-left ${row.pe.oiChange >= 0 ? "text-green-400" : "text-red-400"}`}>
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
                          {visibleCols.oiChg && <td />}{visibleCols.vol && <td />}{visibleCols.iv && <td />}{visibleCols.delta && <td />}{visibleCols.bidAsk && <td />}
                          <td className="py-1.5 px-1.5 text-right text-[10px] text-gray-500">TOTAL</td>
                          <td className="py-1.5 px-2 text-center sticky left-0 bg-gray-900 z-10">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${chain[0]?.totalPeOI && chain[0]?.totalCeOI ? (chain[0].totalPeOI / chain[0].totalCeOI > 1 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400") : "text-gray-500"}`}>
                              PCR {chain[0]?.totalCeOI ? (chain[0].totalPeOI / chain[0].totalCeOI).toFixed(2) : "—"}
                            </span>
                          </td>
                          <td className="py-1.5 px-1.5 text-left text-[10px] text-gray-500">TOTAL</td>
                          {visibleCols.bidAsk && <td />}{visibleCols.delta && <td />}{visibleCols.iv && <td />}{visibleCols.vol && <td />}{visibleCols.oiChg && <td />}
                          {visibleCols.oi && <td className="py-1.5 px-1.5 text-left text-red-400 font-semibold">{formatOI(chain.reduce((s, r) => s + r.pe.oi, 0))}</td>}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null)}

              {/* Selected option */}
              {isOption && selectedStrike && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-sm font-semibold text-white">{selectedSymbol} {selectedExpiry && fmtExpiry(selectedExpiry)} {selectedStrike} {instrumentType}</p>
                  <p className="text-sm text-gray-400 mt-0.5">LTP: {INR}{selectedOptionLtp?.toFixed(2)} | Lot: {lotSize} shares</p>
                </div>
              )}

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
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Target</label>
                        <input type="number" step="0.05" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} placeholder={`> ${entry.toFixed(2)}`}
                          className={`w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-white placeholder-gray-600 ${INTERACTION_CLASSES.formInput}`} />
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

              {/* Breakeven, max P&L, payoff */}
              {isOption && selectedStrike && currentLtp > 0 && (() => {
                const premium = effectivePrice;
                const side: "CE" | "PE" = instrumentType === "PE" ? "PE" : "CE";
                const be = side === "CE" ? selectedStrike + premium : selectedStrike - premium;
                const longCapped = side === "CE" ? Infinity : (selectedStrike - premium) * totalShares;
                const maxProfit = tradeType === "BUY" ? longCapped : premium * totalShares;
                const maxLoss = tradeType === "BUY" ? premium * totalShares : longCapped;
                const fmtMoney = (v: number) =>
                  v === Infinity ? "Unlimited" : `${INR}${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
                return (
                  <div className="bg-gray-800 rounded-lg p-3">
                    <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                      <div><p className="text-gray-500">Breakeven</p><p className="text-white font-medium">{INR}{be.toFixed(2)}</p></div>
                      <div><p className="text-gray-500">Max profit</p><p className="text-green-400 font-medium">{fmtMoney(maxProfit)}</p></div>
                      <div><p className="text-gray-500">Max loss</p><p className="text-red-400 font-medium">{fmtMoney(maxLoss)}</p></div>
                    </div>
                    <div className="h-32 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={optionPayoff(side, tradeType, selectedStrike, premium, totalShares)} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                          <XAxis dataKey="s" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                          <Tooltip
                            formatter={(v) => `${INR}${Number(v).toLocaleString("en-IN")}`}
                            labelFormatter={(l) => `Underlying ${l}`}
                            contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 }}
                          />
                          <ReferenceLine y={0} stroke="#4b5563" />
                          <Line type="monotone" dataKey="pnl" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
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
              </>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ---------------- Strategy Builder ----------------
interface StrategyLeg { id: number; action: "BUY" | "SELL"; side: "CE" | "PE"; strike: number; lots: number }
let legIdCounter = 0;

function legPremium(leg: StrategyLeg, chain: OptionChainData[]): number {
  const row = chain.find((r) => r.strike_price === leg.strike);
  if (!row) return 0;
  return leg.side === "CE" ? row.ce.ltp : row.pe.ltp;
}

function strategyMetrics(legs: StrategyLeg[], chain: OptionChainData[], lotSize: number) {
  if (legs.length === 0) return null;
  const strikes = legs.map((l) => l.strike);
  const lo = Math.min(...strikes) * 0.8;
  const hi = Math.max(...strikes) * 1.2;
  const steps = 60;
  const points: { s: number; pnl: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const s = lo + ((hi - lo) * i) / (steps - 1);
    let pnl = 0;
    for (const leg of legs) {
      const prem = legPremium(leg, chain);
      const intrinsic = leg.side === "CE" ? Math.max(0, s - leg.strike) : Math.max(0, leg.strike - s);
      pnl += (leg.action === "BUY" ? intrinsic - prem : prem - intrinsic) * leg.lots * lotSize;
    }
    points.push({ s: Math.round(s), pnl: Math.round(pnl) });
  }
  let netPremium = 0;
  for (const leg of legs) {
    netPremium += (leg.action === "BUY" ? -legPremium(leg, chain) : legPremium(leg, chain)) * leg.lots * lotSize;
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
  return { points, netPremium, maxProfit, maxLoss, breakevens };
}

const STRATEGY_TEMPLATES = [
  { key: "straddle", label: "Long Straddle" },
  { key: "strangle", label: "Long Strangle" },
  { key: "bullcall", label: "Bull Call" },
  { key: "bearput", label: "Bear Put" },
  { key: "ironcondor", label: "Iron Condor" },
  { key: "butterfly", label: "Call Butterfly" },
];

function buildTemplate(key: string, atm: number, chain: OptionChainData[]): StrategyLeg[] {
  const strikes = chain.map((r) => r.strike_price).sort((a, b) => a - b);
  const idx = strikes.indexOf(atm);
  if (idx < 0) return [];
  const at = (off: number): number | undefined => strikes[idx + off];
  const L = (action: "BUY" | "SELL", side: "CE" | "PE", strike: number | undefined, lots = 1): StrategyLeg | null =>
    strike == null ? null : { id: (legIdCounter += 1), action, side, strike, lots };
  let legs: (StrategyLeg | null)[] = [];
  switch (key) {
    case "straddle": legs = [L("BUY", "CE", at(0)), L("BUY", "PE", at(0))]; break;
    case "strangle": legs = [L("BUY", "CE", at(1)), L("BUY", "PE", at(-1))]; break;
    case "bullcall": legs = [L("BUY", "CE", at(0)), L("SELL", "CE", at(1))]; break;
    case "bearput": legs = [L("BUY", "PE", at(0)), L("SELL", "PE", at(-1))]; break;
    case "ironcondor": legs = [L("SELL", "PE", at(-1)), L("BUY", "PE", at(-2)), L("SELL", "CE", at(1)), L("BUY", "CE", at(2))]; break;
    case "butterfly": legs = [L("BUY", "CE", at(-1)), L("SELL", "CE", at(0)), L("SELL", "CE", at(0)), L("BUY", "CE", at(1))]; break;
  }
  return legs.filter((l): l is StrategyLeg => l !== null);
}

function StrategyBuilder({
  chain,
  atmStrike,
  lotSize,
  symbol,
  expiry,
  exchange,
  userId,
  onPlaced,
}: {
  chain: OptionChainData[];
  atmStrike: number;
  lotSize: number;
  symbol: string;
  expiry: string | null;
  exchange: string;
  userId: string;
  onPlaced: () => void;
}) {
  const [legs, setLegs] = useState<StrategyLeg[]>([]);
  const [placingStrategy, setPlacingStrategy] = useState(false);
  const strikes = chain.map((r) => r.strike_price).sort((a, b) => a - b);
  const metrics = strategyMetrics(legs, chain, lotSize);
  const hasShort = legs.some((l) => l.action === "SELL");

  async function placeStrategy() {
    if (!userId || legs.length === 0 || hasShort || !expiry) return;
    setPlacingStrategy(true);
    let ok = 0;
    let fail = 0;
    for (const leg of legs) {
      const res = await placeOrder(userId, {
        symbol,
        exchange,
        instrument_type: leg.side,
        option_type: leg.side,
        strike_price: leg.strike,
        expiry_date: expiry,
        lot_size: lotSize,
        order_type: "MARKET",
        trade_type: leg.action,
        quantity: leg.lots * lotSize,
        price: null,
        trigger_price: null,
        notes: "Strategy",
      });
      if (res.success) ok += 1;
      else fail += 1;
    }
    setPlacingStrategy(false);
    showToast(`Strategy: ${ok} leg(s) placed${fail ? `, ${fail} failed` : ""}`, fail ? "error" : "success");
    onPlaced();
  }
  const fmtMoney = (v: number) =>
    Math.abs(v) === Infinity ? "Unlimited" : `${INR}${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  if (chain.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-6">Select an expiry to load strikes.</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-gray-400 mb-1.5">Templates</p>
        <div className="flex flex-wrap gap-1.5">
          {STRATEGY_TEMPLATES.map((t) => (
            <button key={t.key} onClick={() => setLegs(buildTemplate(t.key, atmStrike, chain))}
              className="text-[11px] px-2 py-1 rounded-md bg-gray-800 text-gray-300 hover:bg-violet-500/20 hover:text-violet-300 cursor-pointer active:scale-95 transition-all duration-200">
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {legs.map((leg) => (
          <div key={leg.id} className="flex items-center gap-1.5 text-xs">
            <button onClick={() => setLegs((ls) => ls.map((l) => (l.id === leg.id ? { ...l, action: l.action === "BUY" ? "SELL" : "BUY" } : l)))}
              className={`px-2 py-1 rounded-md font-semibold w-12 cursor-pointer ${leg.action === "BUY" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{leg.action}</button>
            <button onClick={() => setLegs((ls) => ls.map((l) => (l.id === leg.id ? { ...l, side: l.side === "CE" ? "PE" : "CE" } : l)))}
              className={`px-2 py-1 rounded-md font-semibold w-10 cursor-pointer ${leg.side === "CE" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>{leg.side}</button>
            <select value={leg.strike} onChange={(e) => setLegs((ls) => ls.map((l) => (l.id === leg.id ? { ...l, strike: Number(e.target.value) } : l)))}
              className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-white cursor-pointer">
              {strikes.map((s) => <option key={s} value={s}>{s.toLocaleString("en-IN")}</option>)}
            </select>
            <input type="number" min={1} value={leg.lots} onChange={(e) => setLegs((ls) => ls.map((l) => (l.id === leg.id ? { ...l, lots: Math.max(1, parseInt(e.target.value, 10) || 1) } : l)))}
              className="w-14 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-white" />
            <span className="text-gray-500">@{INR}{legPremium(leg, chain).toFixed(1)}</span>
            <button onClick={() => setLegs((ls) => ls.filter((l) => l.id !== leg.id))} className="text-red-400 hover:text-red-300 cursor-pointer ml-auto px-1" aria-label="Remove leg">✕</button>
          </div>
        ))}
        <button onClick={() => setLegs((ls) => [...ls, { id: (legIdCounter += 1), action: "BUY", side: "CE", strike: atmStrike, lots: 1 }])}
          className="text-[11px] text-violet-400 hover:text-violet-300 cursor-pointer">+ Add leg</button>
      </div>

      {metrics && legs.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-2">
            <div><p className="text-gray-500">{metrics.netPremium >= 0 ? "Net credit" : "Net debit"}</p><p className="text-white font-medium">{INR}{Math.abs(metrics.netPremium).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p></div>
            <div><p className="text-gray-500">Max profit</p><p className="text-green-400 font-medium">{fmtMoney(metrics.maxProfit)}</p></div>
            <div><p className="text-gray-500">Max loss</p><p className="text-red-400 font-medium">{fmtMoney(metrics.maxLoss)}</p></div>
            <div><p className="text-gray-500">Breakeven</p><p className="text-white font-medium">{metrics.breakevens.length ? metrics.breakevens.join(", ") : "—"}</p></div>
          </div>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={metrics.points} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="s" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                <Tooltip formatter={(v) => `${INR}${Number(v).toLocaleString("en-IN")}`} labelFormatter={(l) => `Underlying ${l}`} contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 }} />
                <ReferenceLine y={0} stroke="#4b5563" />
                <Line type="monotone" dataKey="pnl" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-gray-600 mt-1">Combined payoff at expiry.</p>
          <button
            onClick={placeStrategy}
            disabled={placingStrategy || hasShort || !userId}
            className={`${INTERACTION_CLASSES.primaryButton} w-full mt-2 py-2.5 rounded-lg text-sm font-semibold text-white`}
          >
            {placingStrategy ? "Placing…" : `Place strategy (${legs.length} leg${legs.length > 1 ? "s" : ""})`}
          </button>
          {hasShort && (
            <p className="text-[10px] text-amber-400 mt-1">
              Short/writing legs can&apos;t be placed yet (engine is long-only). All-long strategies like straddle/strangle can be placed.
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

function isMonthlyExpiry(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const lastDayOfWeek = lastDay.getDay();
  const diff = (lastDayOfWeek - 4 + 7) % 7;
  const lastThursday = new Date(lastDay);
  lastThursday.setDate(lastDay.getDate() - diff);
  return d.getDate() === lastThursday.getDate() && d.getMonth() === lastThursday.getMonth();
}
