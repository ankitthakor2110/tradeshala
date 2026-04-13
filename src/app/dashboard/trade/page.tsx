"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useIsMounted } from "@/hooks/useIsMounted";
import { getCurrentUser } from "@/services/auth.service";
import { searchStocks, getStockQuote, getIndicesData } from "@/services/market-data.service";
import { TRADE_CONFIG } from "@/config/trade";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import { getPnLColor } from "@/utils/colors";
import { formatOI } from "@/utils/format";
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

  const [userId, setUserId] = useState("");
  const [virtualCash, setVirtualCash] = useState(1000000);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [nifty, setNifty] = useState<MarketData | null>(null);
  const [bankNifty, setBankNifty] = useState<MarketData | null>(null);
  const [indicesSource, setIndicesSource] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
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
  const [orderNotes, setOrderNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{ msg: string; detail: string } | null>(null);

  useEffect(() => {
    getCurrentUser().then(async (user) => {
      if (!user) return;
      setUserId(user.id);
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("virtual_balance").eq("id", user.id).single<{ virtual_balance: number }>();
      if (data) setVirtualCash(data.virtual_balance);
    });
    getIndicesData().then((res) => { if (res) { setNifty(res.nifty50); setBankNifty(res.bankNifty); setIndicesSource(res.source ?? null); } });
  }, []);

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
        setChain(filterStrikes(fullChain, atm, selectedSymbol));
        setChainLoading(false);
      })
      .catch(() => { setChain([]); setChainLoading(false); });
  }, [selectedSymbol, selectedExpiry, instrumentType, quote?.last_price]);

  function openTradeModal(symbol: string, name: string, exchange: string) {
    setSelectedSymbol(symbol); setSelectedName(name); setSelectedExchange(exchange);
    setInstrumentType("CE"); setTradeType("BUY"); setOrderType("MARKET"); setOrderQty(1);
    setOrderPrice(""); setOrderTrigger(""); setOrderNotes(""); setShowNotes(false);
    setConfirmStep(false); setOrderSuccess(null); setQuote(null);
    setSelectedStrike(null); setSelectedOptionLtp(null); setSelectedSide("CE"); setFlashStrike(null);
    setModalOpen(true); fetchQuote(symbol, exchange);
  }

  function handleStrikeSelect(strike: number, ltp: number, side: "CE" | "PE") {
    setSelectedStrike(strike); setSelectedOptionLtp(ltp); setInstrumentType(side); setSelectedSide(side);
    setFlashStrike(strike);
    setTimeout(() => setFlashStrike(null), 300);
    setTimeout(() => placeOrderRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 200);
  }

  const lotSize = TRADE_CONFIG.defaultLotSizes[selectedSymbol] ?? 1;
  const isOption = instrumentType !== "EQ";
  const currentLtp = isOption && selectedOptionLtp ? selectedOptionLtp : (quote?.last_price ?? 0);
  const effectivePrice = orderType === "LIMIT" && orderPrice ? parseFloat(orderPrice) : currentLtp;
  const totalShares = isOption ? orderQty * lotSize : orderQty;
  const grossValue = effectivePrice * totalShares;
  const estFill = currentLtp > 0
    ? simulateFill({ symbol: selectedSymbol, exchange: selectedExchange, instrument_type: instrumentType, option_type: isOption ? instrumentType : null, strike_price: selectedStrike, expiry_date: selectedExpiry, lot_size: lotSize, order_type: orderType, trade_type: tradeType, quantity: totalShares, price: orderType === "LIMIT" ? parseFloat(orderPrice) || null : null, trigger_price: (orderType === "SL" || orderType === "SL-M") ? parseFloat(orderTrigger) || null : null, notes: null }, currentLtp)
    : null;
  const charges = estFill ? estFill.brokerage + estFill.slippage : 20;
  const totalValue = grossValue + charges;
  const cashAfter = tradeType === "BUY" ? virtualCash - totalValue : virtualCash + grossValue - 20;
  const canAfford = tradeType === "BUY" ? cashAfter >= 0 : true;

  async function handlePlaceOrder() {
    setPlacing(true);
    const od: OrderFormData = { symbol: selectedSymbol, exchange: selectedExchange, instrument_type: instrumentType, option_type: isOption ? instrumentType : null, strike_price: selectedStrike, expiry_date: selectedExpiry, lot_size: lotSize, order_type: orderType, trade_type: tradeType, quantity: totalShares, price: orderType === "LIMIT" ? parseFloat(orderPrice) || null : null, trigger_price: (orderType === "SL" || orderType === "SL-M") ? parseFloat(orderTrigger) || null : null, notes: orderNotes || null };
    const result = await placeOrder(userId, od);
    setPlacing(false);
    if (result.success) {
      setVirtualCash((p) => tradeType === "BUY" ? p - totalValue : p + grossValue - 20);
      setOrderSuccess({ msg: `${tradeType === "BUY" ? "Bought" : "Sold"} ${isOption ? `${orderQty} lot` : `${totalShares} shares`} of ${selectedSymbol}${isOption && selectedStrike ? ` ${selectedStrike} ${instrumentType}` : ""} at ${INR}${(result.fill?.executed_price ?? effectivePrice).toFixed(2)}`, detail: tradeType === "BUY" ? `${INR}${totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })} deducted` : `${INR}${(grossValue - 20).toLocaleString("en-IN", { maximumFractionDigits: 0 })} credited` });
    } else { showToast(result.message, "error"); setConfirmStep(false); }
  }

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <IndexQuickCard data={nifty} label="NIFTY 50" source={ls} onTrade={() => openTradeModal("NIFTY", "Nifty 50", "NSE")} />
            <IndexQuickCard data={bankNifty} label="BANK NIFTY" source={ls} onTrade={() => openTradeModal("BANKNIFTY", "Bank Nifty", "NSE")} />
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

              {/* CE / PE tabs */}
              <div className="flex gap-1 bg-gray-800/50 p-1 rounded-lg">
                {(["CE", "PE"] as const).map((t) => (
                  <button key={t} onClick={() => { setInstrumentType(t); setSelectedStrike(null); setSelectedOptionLtp(null); setSelectedSide(t); }}
                    className={`flex-1 text-sm font-semibold py-2 rounded-md cursor-pointer transition-all duration-200 active:scale-95 ${instrumentType === t ? "bg-violet-500 text-white shadow-md" : "text-gray-400 hover:text-white hover:bg-gray-700"}`}>
                    {t === "CE" ? "Call (CE)" : "Put (PE)"}
                  </button>
                ))}
              </div>

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
                              <td className="py-1.5 px-1.5 text-right cursor-pointer" onClick={() => handleStrikeSelect(row.strike_price, row.ce.ltp, "CE")}>
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
                              <td className="py-1.5 px-1.5 text-left cursor-pointer" onClick={() => handleStrikeSelect(row.strike_price, row.pe.ltp, "PE")}>
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
                <div className="flex justify-between border-t border-gray-700 pt-1.5 mt-1"><span className="text-xs text-gray-400 font-medium">Total</span><span className="text-sm font-bold text-white">{INR}{totalValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between"><span className="text-xs text-gray-400">Balance</span><span className="text-sm text-white">{INR}{virtualCash.toLocaleString("en-IN")}</span></div>
                <div className="flex justify-between"><span className="text-xs text-gray-400">After</span><span className={`text-sm font-medium ${canAfford ? "text-green-400" : "text-red-400"}`}>{INR}{cashAfter.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>
                {!canAfford && <p className="text-red-400 text-xs">Insufficient funds</p>}
              </div>

              {/* Place / Confirm */}
              <div ref={placeOrderRef}>
                {!confirmStep ? (
                  <button onClick={() => setConfirmStep(true)} disabled={placing || !canAfford || currentLtp <= 0}
                    className={`w-full py-3 rounded-xl text-base font-semibold cursor-pointer transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${tradeType === "BUY" ? "bg-green-500 hover:bg-green-400 text-white" : "bg-red-500 hover:bg-red-400 text-white"}`}>
                    Place {tradeType} Order
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
        </div>
      </Modal>
    </div>
  );
}

function IndexQuickCard({ data, label, source, onTrade }: { data: MarketData | null; label: string; source: string; onTrade: () => void }) {
  return (
    <button onClick={onTrade} className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-5 text-left cursor-pointer hover:border-violet-500/30 hover:-translate-y-1 transition-all duration-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2"><span className="text-sm font-bold text-white">{label}</span><span className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">NSE</span></div>
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
