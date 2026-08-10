"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useIsMounted } from "@/hooks/useIsMounted";
import { useIntelData } from "@/hooks/useIntelData";
import { INTEL_CONFIG } from "@/config/intel";
import Skeleton from "@/components/ui/Skeleton";
import VerdictHero from "@/components/intel/VerdictHero";
import AiBrief from "@/components/intel/AiBrief";
import MarketOverview from "@/components/intel/MarketOverview";
import SentimentEngine from "@/components/intel/SentimentEngine";
import OiAnalysis from "@/components/intel/OiAnalysis";
import TradeSetups from "@/components/intel/TradeSetups";
import TradeChecklist from "@/components/intel/TradeChecklist";
import AiInsights from "@/components/intel/AiInsights";
import ConfigPanel from "@/components/intel/ConfigPanel";
import NoFeedCard from "@/components/intel/NoFeedCard";
import EventRiskPanel from "@/components/intel/EventRiskPanel";
import IntelligenceScoreCard from "@/components/intel/IntelligenceScoreCard";
import WriterIntelligence from "@/components/intel/WriterIntelligence";
import PremiumBehaviour from "@/components/intel/PremiumBehaviour";
import StrikeMigration from "@/components/intel/StrikeMigration";
import BullBearScore from "@/components/intel/BullBearScore";
import TradeReadiness from "@/components/intel/TradeReadiness";
import ConfidenceEngine from "@/components/intel/ConfidenceEngine";
import InstitutionalFlow from "@/components/intel/InstitutionalFlow";

// Heavy / self-fetching sections are code-split so the decision core paints first.
const OptionChainTable = dynamic(() => import("@/components/intel/OptionChainTable"), {
  ssr: false,
  loading: () => <Skeleton variant="card" className="h-72" />,
});
const MarketInternals = dynamic(() => import("@/components/intel/MarketInternals"), {
  ssr: false,
  loading: () => <Skeleton variant="card" className="h-56" />,
});

/** Initial symbol from `?symbol=` (validated against the supported set). */
function initialSymbolKey(): string {
  const fallback = INTEL_CONFIG.symbols[0].key;
  if (typeof window === "undefined") return fallback;
  const p = new URLSearchParams(window.location.search).get("symbol")?.toUpperCase();
  return p && INTEL_CONFIG.symbols.some((s) => s.key === p) ? p : fallback;
}

export default function MarketIntelPage() {
  const mounted = useIsMounted();
  const [symbolKey, setSymbolKey] = useState<string>(initialSymbolKey);
  const { state, loading, isLive, config, setConfig, refresh } = useIntelData(symbolKey);

  const switchSymbol = (key: string) => {
    setSymbolKey(key);
    // Keep the URL shareable/back-navigable without a full navigation.
    window.history.replaceState(null, "", `/dashboard/intel?symbol=${key}`);
  };

  if (!mounted) return null;

  const activeLabel =
    INTEL_CONFIG.symbols.find((s) => s.key === symbolKey)?.label ?? INTEL_CONFIG.symbols[0].label;

  const ready = Boolean(state.verdict && state.sentiment && state.overview && state.oi && state.checklist);

  return (
    <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white lg:text-2xl">{INTEL_CONFIG.page.title}</h1>
            <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-xs font-semibold text-violet-300">
              {activeLabel}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-400 sm:text-sm">{INTEL_CONFIG.page.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="cursor-pointer rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-xs font-medium text-gray-300 transition-all hover:border-violet-500/50 hover:text-white active:scale-95"
        >
          Refresh now
        </button>
      </div>

      {/* Symbol switcher — indices with real chains + real candles. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {INTEL_CONFIG.symbols.map((s) => {
          const active = s.key === symbolKey;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => switchSymbol(s.key)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-all active:scale-95 ${
                active
                  ? "border-violet-500 bg-violet-500/15 text-violet-300"
                  : "border-gray-700 bg-gray-800/60 text-gray-400 hover:border-violet-500/50 hover:text-white"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {!ready ? (
        loading ? (
          <div className="space-y-5">
            <Skeleton variant="card" className="h-40" />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="space-y-5 lg:col-span-2">
                <Skeleton variant="card" className="h-64" />
                <Skeleton variant="card" className="h-72" />
              </div>
              <div className="space-y-5">
                <Skeleton variant="card" className="h-48" />
                <Skeleton variant="card" className="h-48" />
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-400">
            Couldn&apos;t load market data right now. It refreshes automatically, or use “Refresh now”.
          </div>
        )
      ) : (
        <>
          {/* AI decision engine — the first thing a trader sees. */}
          {state.aiBrief && (
            <AiBrief aiBrief={state.aiBrief} intelligenceScore={state.intelligenceScore} bullBear={state.bullBear} />
          )}

          <VerdictHero
            verdict={state.verdict!}
            sentiment={state.sentiment!}
            overview={state.overview!}
            warmingUp={state.warmingUp}
            lastUpdated={state.lastUpdated}
            isLive={isLive}
            eventGate={state.eventRisk?.gate ?? null}
            eventReason={state.eventRisk?.reason ?? null}
          />

          {/* AI decision cards — grouped desk-style below the hero. */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <IntelligenceScoreCard score={state.intelligenceScore} />
            <WriterIntelligence writers={state.writers} />
            <PremiumBehaviour premium={state.premium} />
            <StrikeMigration migration={state.migration} />
            <BullBearScore bullBear={state.bullBear} />
            <TradeReadiness readiness={state.readiness} />
            <ConfidenceEngine confidence={state.confidence} />
            <InstitutionalFlow flow={state.institutionalFlow} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <MarketOverview overview={state.overview!} />
              <OptionChainTable rows={state.rows} underlying={state.underlying} warmingUp={state.warmingUp} />
              <OiAnalysis oi={state.oi!} warmingUp={state.warmingUp} />
              <MarketInternals />
            </div>

            <div className="space-y-5">
              <EventRiskPanel eventRisk={state.eventRisk} />
              <SentimentEngine sentiment={state.sentiment!} />
              <TradeSetups setups={state.setups} threshold={config.confidenceThreshold} />
              <TradeChecklist checklist={state.checklist!} />
              <AiInsights insights={state.insights} />
            </div>
          </div>

          {/* Honest placeholders — requested sections with no data feed yet. */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <NoFeedCard title={INTEL_CONFIG.noFeed.futures.title} note={INTEL_CONFIG.noFeed.futures.note} />
            <NoFeedCard title={INTEL_CONFIG.noFeed.vix.title} note={INTEL_CONFIG.noFeed.vix.note} />
            <NoFeedCard title={INTEL_CONFIG.noFeed.breadth.title} note={INTEL_CONFIG.noFeed.breadth.note} />
            <NoFeedCard title={INTEL_CONFIG.noFeed.sector.title} note={INTEL_CONFIG.noFeed.sector.note} />
          </div>

          <ConfigPanel config={config} setConfig={setConfig} />
        </>
      )}
    </div>
  );
}
