"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuotes } from "./useLiveQuotes";
import { useSnapshotPoller } from "./useSnapshotPoller";
import { getMarketStatus } from "@/services/dashboard.service";
import { getChain, getExpiriesFor, getCandles } from "@/services/intel.service";
import { INTEL_CONFIG } from "@/config/intel";
import type { ChainResponse } from "@/lib/market-data/option-chain";
import type {
  Candle,
  ClassifiedRow,
  IntelState,
  OiAnalysis,
} from "@/types/intel";
import {
  deriveVWAP,
  deriveATR,
  openingRange,
  dayHighLow,
  dayRange,
  distancePct,
  deriveTrend,
  round2,
} from "@/lib/intel/candles";
import { classifyLeg, tagMoneyness, computePCR, maxPain, extremeOi } from "@/lib/intel/optionchain";
import { computeSentiment } from "@/lib/intel/sentiment";
import { buildSetups } from "@/lib/intel/setups";
import { evaluateChecklist } from "@/lib/intel/checklist";
import { buildInsights, generateExtraInsights } from "@/lib/intel/insights";
import { buildVerdict } from "@/lib/intel/verdict";
import { buildEventList, computeEventRisk } from "@/lib/intel/events";
import { calculateWriterConfidence } from "@/lib/intel/writers";
import { calculatePremiumBehaviour } from "@/lib/intel/premium";
import { calculateStrikeMigration } from "@/lib/intel/migration";
import { calculateTradeReadiness } from "@/lib/intel/readiness";
import { calculateIntelligenceScore, calculateConfidenceMetrics } from "@/lib/intel/score";
import { calculateMarketBias, calculateBullBearScore, deriveInstitutionalFlow } from "@/lib/intel/brain";

export interface IntelConfigState {
  refreshMs: number;
  atmRange: number;
  confidenceThreshold: number;
}

const STORAGE_KEY = "intel:config:v1";

function loadConfig(): IntelConfigState {
  const fallback: IntelConfigState = {
    refreshMs: INTEL_CONFIG.refresh.default,
    atmRange: INTEL_CONFIG.chain.atmRangeDefault,
    confidenceThreshold: INTEL_CONFIG.setups.confidenceThresholdDefault,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

// Per-leg snapshot kept between polls to compute session OI/LTP deltas.
type StrikeSnap = { ceOi: number; ceLtp: number; peOi: number; peLtp: number };
type StrikeDelta = {
  ceOi: number | null;
  ceLtp: number | null;
  peOi: number | null;
  peLtp: number | null;
};

const EMPTY_STATE: IntelState = {
  symbol: INTEL_CONFIG.page.symbol,
  expiry: null,
  underlying: 0,
  atmStrike: 0,
  chainSource: "unavailable",
  candleSource: "unavailable",
  warmingUp: true,
  lastUpdated: null,
  overview: null,
  sentiment: null,
  rows: [],
  oi: null,
  setups: [],
  checklist: null,
  insights: [],
  verdict: null,
  eventRisk: null,
  aiBrief: null,
  writers: null,
  premium: null,
  migration: null,
  readiness: null,
  intelligenceScore: null,
  confidence: null,
  bullBear: null,
  institutionalFlow: null,
};

/** Resolve the scheduled event risk (config calendar + live expiry) for `now`. */
function resolveEventRisk(expiry: string | null) {
  const ev = INTEL_CONFIG.events;
  const events = buildEventList(ev.calendar, expiry, ev.expiry);
  return computeEventRisk(
    events,
    Date.now(),
    ev.windows,
    ev.coverageThrough,
    ev.labels.clear,
    ev.labels.empty
  );
}

/**
 * The Market Intelligence brain. Polls the option chain + candles on the chosen
 * cadence, computes SESSION OI deltas (providers report 0), merges the live spot
 * from Realtime, and runs the pure src/lib/intel/* logic into a single
 * `IntelState`. Also drives `useSnapshotPoller` so the shared live feed stays warm.
 */
export function useIntelData() {
  const symbol = INTEL_CONFIG.page.symbol;
  const interval = INTEL_CONFIG.page.candleInterval;
  const liveSymbol = INTEL_CONFIG.page.liveSymbol;

  const [config, setConfigState] = useState<IntelConfigState>(loadConfig);
  const [expiry, setExpiry] = useState<string | null>(null);
  const [rawChain, setRawChain] = useState<ChainResponse | null>(null);
  const [deltas, setDeltas] = useState<Record<number, StrikeDelta>>({});
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candleSource, setCandleSource] = useState<string>("unavailable");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const prevSnapRef = useRef<Map<number, StrikeSnap>>(new Map());
  const pollCountRef = useRef(0);
  // Session-open support/resistance baseline for strike migration (set once).
  const baselineSRRef = useRef<{ support: number; resistance: number } | null>(null);
  const inFlight = useRef(false);
  const spotRef = useRef(0); // latest spot, for the candle mock anchor — kept off poll deps

  const liveMemo = useMemo(() => [liveSymbol], [liveSymbol]);
  const { quotes, isLive } = useLiveQuotes(liveMemo);
  const liveQuote = quotes[liveSymbol];
  useSnapshotPoller(true);

  useEffect(() => {
    spotRef.current = liveQuote?.ltp || rawChain?.underlyingPrice || spotRef.current;
  }, [liveQuote?.ltp, rawChain?.underlyingPrice]);

  const setConfig = useCallback((patch: Partial<IntelConfigState>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota / private-mode errors */
      }
      return next;
    });
  }, []);

  // Resolve the nearest expiry once.
  useEffect(() => {
    let active = true;
    void getExpiriesFor(symbol).then((xs) => {
      if (active && xs.length) setExpiry((cur) => cur ?? xs[0]);
    });
    return () => {
      active = false;
    };
  }, [symbol]);

  const poll = useCallback(async () => {
    if (!expiry || inFlight.current) return;
    inFlight.current = true;
    try {
      const [chain, candleRes] = await Promise.all([
        getChain(symbol, expiry),
        getCandles(symbol, interval, spotRef.current),
      ]);

      if (chain) {
        const prev = prevSnapRef.current;
        const nextDeltas: Record<number, StrikeDelta> = {};
        const nextSnap = new Map<number, StrikeSnap>();
        for (const row of chain.chain) {
          const k = row.strike_price;
          const p = prev.get(k);
          nextDeltas[k] = {
            ceOi: p ? row.ce.oi - p.ceOi : null,
            ceLtp: p ? round2(row.ce.ltp - p.ceLtp) : null,
            peOi: p ? row.pe.oi - p.peOi : null,
            peLtp: p ? round2(row.pe.ltp - p.peLtp) : null,
          };
          nextSnap.set(k, { ceOi: row.ce.oi, ceLtp: row.ce.ltp, peOi: row.pe.oi, peLtp: row.pe.ltp });
        }
        prevSnapRef.current = nextSnap;
        pollCountRef.current += 1;
        // Capture the session-open defended levels once, so strike migration
        // measures drift from the open rather than poll-to-poll noise.
        if (baselineSRRef.current == null) {
          const s = extremeOi(chain.chain, "pe").strike;
          const r = extremeOi(chain.chain, "ce").strike;
          if (s > 0 && r > 0) baselineSRRef.current = { support: s, resistance: r };
        }
        setDeltas(nextDeltas);
        setRawChain(chain);
      }
      setCandles(candleRes.candles);
      setCandleSource(candleRes.source);
      setLastUpdated(new Date().toISOString());
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [expiry, symbol, interval]);

  // Poll on cadence; pause on a hidden tab.
  useEffect(() => {
    if (!expiry) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void poll();
    };
    tick();
    const id = setInterval(tick, config.refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [expiry, config.refreshMs, poll]);

  const refresh = useCallback(() => void poll(), [poll]);

  // ---- Chain-derived block (off the live-tick path; recompute only on poll) ----
  const chainBlock = useMemo(() => {
    if (!rawChain || !rawChain.chain.length) return null;
    const full = rawChain.chain;
    const th = { minOiChange: INTEL_CONFIG.chain.minOiChange, minLtpChange: INTEL_CONFIG.chain.minLtpChange };
    const spot = rawChain.underlyingPrice;
    const atm = rawChain.atmStrike;
    const warming = pollCountRef.current < 2;

    const sorted = [...full].sort((a, b) => a.strike_price - b.strike_price);
    const atmIdx = sorted.findIndex((r) => r.strike_price === atm);
    const center = atmIdx >= 0 ? atmIdx : Math.floor(sorted.length / 2);
    const lo = Math.max(0, center - config.atmRange);
    const hi = Math.min(sorted.length, center + config.atmRange + 1);
    const slice = sorted.slice(lo, hi);

    const rows: ClassifiedRow[] = slice.map((r) => {
      const d = deltas[r.strike_price];
      return {
        strike: r.strike_price,
        moneyness: r.strike_price === atm ? "ATM" : tagMoneyness(r.strike_price, atm, spot, "ce"),
        isAtm: r.strike_price === atm,
        ce: {
          ltp: r.ce.ltp,
          oi: r.ce.oi,
          oiChange: d?.ceOi ?? null,
          volume: r.ce.volume,
          iv: r.ce.iv,
          buildup: classifyLeg("ce", d?.ceOi ?? null, d?.ceLtp ?? null, th),
        },
        pe: {
          ltp: r.pe.ltp,
          oi: r.pe.oi,
          oiChange: d?.peOi ?? null,
          volume: r.pe.volume,
          iv: r.pe.iv,
          buildup: classifyLeg("pe", d?.peOi ?? null, d?.peLtp ?? null, th),
        },
      };
    });

    const pcr = computePCR(full);
    const call = extremeOi(full, "ce");
    const put = extremeOi(full, "pe");
    const mp = maxPain(full);

    // Session OI skew near ATM: fresh put writing (bullish) vs call writing (bearish).
    let putUp = 0;
    let callUp = 0;
    for (const r of slice) {
      const d = deltas[r.strike_price];
      if (d?.peOi && d.peOi > 0) putUp += d.peOi;
      if (d?.ceOi && d.ceOi > 0) callUp += d.ceOi;
    }
    const oiSkewScore = warming || putUp + callUp === 0 ? null : round2((putUp - callUp) / (putUp + callUp));

    let hiCallDelta: number | null = null;
    let hiPutDelta: number | null = null;
    if (!warming) {
      let bc = 0;
      let bp = 0;
      for (const r of slice) {
        const d = deltas[r.strike_price];
        if (d?.ceOi != null && d.ceOi > bc) { bc = d.ceOi; hiCallDelta = r.strike_price; }
        if (d?.peOi != null && d.peOi > bp) { bp = d.peOi; hiPutDelta = r.strike_price; }
      }
    }

    const signals: OiAnalysis["signals"] = [
      {
        label: pcr >= 1.15 ? "Put writers in control" : pcr <= 0.8 ? "Call writers in control" : "Balanced OI",
        explanation: `PCR ${pcr.toFixed(2)} — ${
          pcr >= 1.15 ? "more puts written than calls, a support signal" : pcr <= 0.8 ? "more calls written than puts, a resistance signal" : "call and put OI are roughly matched"
        }.`,
        tone: pcr >= 1.15 ? "bullish" : pcr <= 0.8 ? "bearish" : "neutral",
      },
      {
        label: `Resistance ${call.strike}`,
        explanation: `Highest call OI sits at ${call.strike} — the level call writers are defending.`,
        tone: "bearish",
      },
      {
        label: `Support ${put.strike}`,
        explanation: `Highest put OI sits at ${put.strike} — the level put writers are defending.`,
        tone: "bullish",
      },
    ];

    const oi: OiAnalysis = {
      pcr,
      maxCallOiStrike: call.strike,
      maxCallOi: call.oi,
      maxPutOiStrike: put.strike,
      maxPutOi: put.oi,
      maxPain: mp,
      resistance: call.strike,
      support: put.strike,
      highestCallOiChangeStrike: hiCallDelta,
      highestPutOiChangeStrike: hiPutDelta,
      totalCeOi: full.reduce((s, r) => s + (r.ce?.oi ?? 0), 0),
      totalPeOi: full.reduce((s, r) => s + (r.pe?.oi ?? 0), 0),
      signals,
    };

    // ATM-window (±1 strike) premium behaviour + near-ATM volume/IV primitives
    // for the writer / premium / intelligence-score helpers.
    const atmWin = sorted.slice(Math.max(0, center - 1), Math.min(sorted.length, center + 2));
    let atmCeLtp = 0;
    let atmPeLtp = 0;
    for (const r of atmWin) {
      atmCeLtp += r.ce.ltp;
      atmPeLtp += r.pe.ltp;
    }
    let atmCeLtpDelta: number | null = null;
    let atmPeLtpDelta: number | null = null;
    if (!warming) {
      let ce = 0;
      let pe = 0;
      let ok = true;
      for (const r of atmWin) {
        const d = deltas[r.strike_price];
        if (!d || d.ceLtp == null || d.peLtp == null) {
          ok = false;
          break;
        }
        ce += d.ceLtp;
        pe += d.peLtp;
      }
      if (ok) {
        atmCeLtpDelta = round2(ce);
        atmPeLtpDelta = round2(pe);
      }
    }

    let ceVolNearAtm = 0;
    let peVolNearAtm = 0;
    for (const r of slice) {
      ceVolNearAtm += r.ce.volume ?? 0;
      peVolNearAtm += r.pe.volume ?? 0;
    }

    const atmRow = atmIdx >= 0 ? sorted[atmIdx] : sorted[center];
    const atmCeIv = atmRow?.ce.iv ?? null;
    const atmPeIv = atmRow?.pe.iv ?? null;

    return {
      rows,
      oi,
      oiSkewScore,
      atm,
      warming,
      atmCeLtp,
      atmPeLtp,
      atmCeLtpDelta,
      atmPeLtpDelta,
      ceVolNearAtm,
      peVolNearAtm,
      atmCeIv,
      atmPeIv,
    };
  }, [rawChain, deltas, config.atmRange]);

  // ---- Full state (recomputes on tick; cheap once chainBlock is cached) ----
  const state = useMemo<IntelState>(() => {
    if (!rawChain || !chainBlock) {
      return {
        ...EMPTY_STATE,
        lastUpdated,
        candleSource,
        warmingUp: pollCountRef.current < 2,
        eventRisk: resolveEventRisk(expiry),
      };
    }
    const marketOpen = getMarketStatus();
    const lastClose = candles.length ? candles[candles.length - 1].c : 0;
    const spot = liveQuote?.ltp || rawChain.underlyingPrice || lastClose || 0;
    const open = candles.length ? candles[0].o : spot;
    const prevClose = liveQuote?.prev_close || open || spot;
    const change = liveQuote?.change ?? round2(spot - prevClose);
    const changePercent = liveQuote?.change_percent ?? (prevClose ? round2((change / prevClose) * 100) : 0);

    const { vwap, reliable } = deriveVWAP(candles);
    const atr = deriveATR(candles, INTEL_CONFIG.atrPeriod);
    const or = openingRange(candles, INTEL_CONFIG.openingRangeMinutes);
    const hl = dayHighLow(candles);
    const { trend, confidence: trendConfidence } = deriveTrend(candles, vwap);
    const distanceFromVwapPct = distancePct(spot, vwap);
    const gap = round2(open - prevClose);
    const gapPct = prevClose ? round2((gap / prevClose) * 100) : 0;

    const overview = {
      ltp: spot,
      change,
      changePercent,
      open,
      prevClose,
      gap,
      gapPercent: gapPct,
      gapType: gap > prevClose * 0.0005 ? "gap-up" : gap < -prevClose * 0.0005 ? "gap-down" : "flat",
      dayHigh: hl?.high ?? null,
      dayLow: hl?.low ?? null,
      openRangeHigh: or?.high ?? null,
      openRangeLow: or?.low ?? null,
      vwap,
      vwapReliable: reliable,
      atr,
      dayRange: dayRange(candles),
      distanceFromVwapPct,
      trend,
      trendConfidence,
      marketOpen,
    } as const;

    const { oi, oiSkewScore } = chainBlock;

    const sentiment = computeSentiment({
      pcr: oi.pcr,
      priceVsVwapPct: distanceFromVwapPct,
      trend,
      trendConfidence,
      oiSkewScore,
      changePercent,
    });

    const verdict = buildVerdict({ sentiment, overview, support: oi.support, resistance: oi.resistance });

    const setups = buildSetups(
      {
        ltp: spot,
        vwap,
        atr,
        openRangeHigh: overview.openRangeHigh,
        openRangeLow: overview.openRangeLow,
        dayHigh: overview.dayHigh,
        dayLow: overview.dayLow,
        support: oi.support,
        resistance: oi.resistance,
        bias: sentiment.overall,
        bullScore: sentiment.bull,
        bearScore: sentiment.bear,
        trendConfidence,
      },
      config.confidenceThreshold
    );

    const checklist = evaluateChecklist({
      ltp: spot,
      vwap,
      trend,
      pcr: oi.pcr,
      openRangeHigh: overview.openRangeHigh,
      openRangeLow: overview.openRangeLow,
      changePercent,
      maxPain: oi.maxPain,
      oiSkewScore,
      support: oi.support,
      resistance: oi.resistance,
    });

    const eventRisk = resolveEventRisk(expiry);

    // ---- AI decision-engine layer (all DERIVED from the reads above) ----
    const writers = calculateWriterConfidence({
      pcr: oi.pcr,
      oiSkewScore,
      atmPeLtpDelta: chainBlock.atmPeLtpDelta,
      atmCeLtpDelta: chainBlock.atmCeLtpDelta,
    });

    const premium = calculatePremiumBehaviour({
      ceLtp: chainBlock.atmCeLtp,
      peLtp: chainBlock.atmPeLtp,
      ceLtpDelta: chainBlock.atmCeLtpDelta,
      peLtpDelta: chainBlock.atmPeLtpDelta,
    });

    const migration = calculateStrikeMigration({
      prevSupport: baselineSRRef.current?.support ?? null,
      prevResistance: baselineSRRef.current?.resistance ?? null,
      currSupport: oi.support,
      currResistance: oi.resistance,
    });

    const bullBear = calculateBullBearScore(sentiment.bull, sentiment.bear);
    const institutionalFlow = deriveInstitutionalFlow({ writerWinner: writers.winner, changePercent });

    const intelligenceScore = calculateIntelligenceScore({
      premiumTone: premium.tone,
      premiumAvailable: !premium.insufficient,
      pcr: oi.pcr,
      oiSkewScore,
      ceVolume: chainBlock.ceVolNearAtm,
      peVolume: chainBlock.peVolNearAtm,
      migrationTone: migration.tone,
      migrationAvailable: !migration.insufficient,
      trend,
      trendConfidence,
      atmCeIv: chainBlock.atmCeIv,
      atmPeIv: chainBlock.atmPeIv,
      changePercent,
      distanceFromVwapPct,
    });

    const readiness = calculateTradeReadiness({
      writerWinner: writers.winner,
      pcr: oi.pcr,
      premiumTone: premium.tone,
      oiSkewScore,
      ceVolume: chainBlock.ceVolNearAtm,
      peVolume: chainBlock.peVolNearAtm,
      migrationTone: migration.tone,
      ltp: spot,
      vwap,
      changePercent,
      support: oi.support,
      resistance: oi.resistance,
    });

    const topSetup = setups[0] ?? null;
    const distanceToTriggerAtr = topSetup && atr ? Math.abs(spot - topSetup.trigger) / atr : null;
    const atExtreme =
      (overview.dayHigh != null && spot > 0 && Math.abs(spot - overview.dayHigh) / spot < 0.001) ||
      (overview.dayLow != null && spot > 0 && Math.abs(spot - overview.dayLow) / spot < 0.001);

    const winnerConfidence =
      writers.winner === "put"
        ? writers.putConfidence
        : writers.winner === "call"
          ? writers.callConfidence
          : writers.putConfidence != null && writers.callConfidence != null
            ? Math.max(writers.putConfidence, writers.callConfidence)
            : null;

    const confidence = calculateConfidenceMetrics({
      writerConfidence: winnerConfidence,
      setupConfidence: topSetup?.confidence ?? null,
      trend,
      trendConfidence,
      trap: verdict.trap,
      distanceToTriggerAtr,
      oiSkewScore,
      changePercent,
      eventGate: eventRisk?.gate ?? null,
      atExtreme,
    });

    const aiBrief = calculateMarketBias({
      bias: sentiment.overall,
      confidence: sentiment.confidence,
      reasons: sentiment.reasons,
      topSetup: topSetup ? { direction: topSetup.direction, trigger: topSetup.trigger } : null,
      support: oi.support,
      resistance: oi.resistance,
      trendConfidence,
      eventGate: eventRisk?.gate ?? null,
      trap: verdict.trap,
      falseBreakoutRisk: confidence.falseBreakoutRisk,
    });

    const insights = [
      ...buildInsights({ overview, sentiment, oi, verdict }),
      ...generateExtraInsights({ writers, premium, migration, confidence, oi }),
    ];

    return {
      symbol,
      expiry,
      underlying: spot,
      atmStrike: chainBlock.atm,
      chainSource: rawChain.source,
      candleSource,
      warmingUp: chainBlock.warming,
      lastUpdated,
      overview,
      sentiment,
      rows: chainBlock.rows,
      oi,
      setups,
      checklist,
      insights,
      verdict,
      eventRisk,
      aiBrief,
      writers,
      premium,
      migration,
      readiness,
      intelligenceScore,
      confidence,
      bullBear,
      institutionalFlow,
    };
  }, [rawChain, chainBlock, candles, candleSource, liveQuote, expiry, symbol, lastUpdated, config.confidenceThreshold]);

  return { state, loading, isLive, config, setConfig, refresh };
}
