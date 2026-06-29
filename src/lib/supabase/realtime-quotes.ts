"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { LiveQuote } from "@/types/database";

// ============================================================================
// Shared Realtime price store — ONE channel, ONE binding.
// ----------------------------------------------------------------------------
// In this Supabase project, a channel only reliably delivers its FIRST
// postgres_changes binding, and a second channel added later to the shared
// browser client silently misses events. The one path proven to work is the
// `live_quotes` channel (indices tick on the dashboard). So we put EVERYTHING on
// it: the option-streaming worker writes option LTPs into `live_quotes` keyed by
// the Upstox instrument_key (which contains a "|", e.g. "NSE_FO|71473"), and we
// route rows here by key shape — instrument keys → option store, display symbols
// → quote store. One binding, zero polling, reliable delivery.
// ============================================================================

const isOptionKey = (symbol: string): boolean => symbol.includes("|");

const quotesBySymbol: Record<string, LiveQuote> = {};
const optionByKey: Record<string, LiveQuote> = {};
const listeners = new Set<() => void>();

let channel: RealtimeChannel | null = null;
let refCount = 0;
let live = false;

function emit(): void {
  for (const l of listeners) l();
}

function openChannel(): void {
  if (channel) return;
  const sb = createClient();
  channel = sb
    .channel("live_quotes_shared")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "live_quotes" },
      (p) => {
        const row = p.new as LiveQuote;
        if (!row?.symbol) return;
        if (isOptionKey(row.symbol)) optionByKey[row.symbol] = row;
        else quotesBySymbol[row.symbol] = row;
        emit();
      }
    )
    .subscribe((status) => {
      live = status === "SUBSCRIBED";
      emit();
    });
}

/** Open the shared channel (ref-counted). Returns a release fn for cleanup. */
export function acquireQuotes(): () => void {
  refCount += 1;
  openChannel();
  return () => {
    refCount -= 1;
    if (refCount <= 0 && channel) {
      const sb = createClient();
      sb.removeChannel(channel);
      channel = null;
      live = false;
    }
  };
}

export function onQuotesChange(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function isQuotesLive(): boolean {
  return live;
}

export function getLiveQuote(symbol: string): LiveQuote | undefined {
  return quotesBySymbol[symbol];
}

export function getLiveOptionQuote(key: string): LiveQuote | undefined {
  return optionByKey[key];
}

// Seed initial rows for first paint (the channel only carries future changes).
// Both live in `live_quotes`; option contracts are keyed by instrument_key.
async function prime(keys: string[], store: Record<string, LiveQuote>): Promise<void> {
  if (keys.length === 0) return;
  const sb = createClient();
  const { data } = await sb
    .from("live_quotes")
    .select("*")
    .in("symbol", keys)
    .returns<LiveQuote[]>();
  if (data && data.length) {
    for (const r of data) store[r.symbol] = r;
    emit();
  }
}

export function primeQuotes(symbols: string[]): Promise<void> {
  return prime(symbols, quotesBySymbol);
}

export function primeOptionQuotes(keys: string[]): Promise<void> {
  return prime(keys, optionByKey);
}
