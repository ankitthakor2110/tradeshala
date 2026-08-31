"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import { AUTO_TRADE_COPY as T } from "@/config/autoTrade";
import { DEFAULT_AUTO_CONFIG } from "@/lib/auto/config";
import { getCurrentUser } from "@/services/auth.service";
import {
  getTradingConfig,
  saveTradingConfig,
  getAutomationStatus,
  setEmergencyStop,
  submitTestSignal,
  type AutomationStatus,
} from "@/services/auto-trade.service";
import type { AutoTradeConfig, Decision } from "@/types/autoTrade";
import { useIsMounted } from "@/hooks/useIsMounted";
import { showToast } from "@/components/ui/Toast";
import Skeleton from "@/components/ui/Skeleton";
import ButtonLoader from "@/components/ui/ButtonLoader";
import AutomationStatusCard from "@/components/auto/AutomationStatusCard";
import { Card, Field, Select, NumberInput, TextInput, Toggle } from "@/components/auto/Controls";

const O = T.options;
const L = T.labels;

export default function AutoTradingPage() {
  const mounted = useIsMounted();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AutoTradeConfig>(DEFAULT_AUTO_CONFIG);
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [emergencyStopped, setEmergencyStopped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmStop, setConfirmStop] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getAutomationStatus());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user) {
        router.push("/login");
        return;
      }
      try {
        const res = await getTradingConfig();
        setConfig(res.config);
        setEmergencyStopped(res.emergencyStopped);
      } catch {
        showToast("Could not load configuration", "error");
      }
      await refreshStatus();
      setLoading(false);
    })();
  }, [router, refreshStatus]);

  // --- update helpers ---
  const setTop = <K extends keyof AutoTradeConfig>(key: K, value: AutoTradeConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));
  const setSection = <K extends keyof AutoTradeConfig>(section: K, patch: Partial<AutoTradeConfig[K]>) =>
    setConfig((c) => ({ ...c, [section]: { ...(c[section] as object), ...patch } }));

  const handleSave = useCallback(async () => {
    setSaving(true);
    setErrors([]);
    const res = await saveTradingConfig(config);
    if (res.ok) {
      showToast(`Configuration saved (v${res.version})`, "success");
      await refreshStatus();
    } else {
      setErrors(res.errors.length ? res.errors : [res.error]);
      showToast(res.error, "error");
    }
    setSaving(false);
  }, [config, refreshStatus]);

  const handleEmergency = useCallback(
    async (stopped: boolean) => {
      try {
        await setEmergencyStop(stopped);
        setEmergencyStopped(stopped);
        setConfirmStop(false);
        showToast(stopped ? "Automatic trading stopped" : "Automatic trading resumed", stopped ? "info" : "success");
        await refreshStatus();
      } catch (e) {
        showToast((e as Error).message, "error");
      }
    },
    [refreshStatus]
  );

  if (!mounted) return null;

  const active = config.enabled && !emergencyStopped && config.mode !== "MANUAL";

  return (
    <div className="max-w-5xl mx-auto space-y-5 sm:space-y-6">
      {/* HEADER + BIG STATE */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-white">{T.page.title}</h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">{T.page.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl border ${
              emergencyStopped
                ? "text-red-400 border-red-500/30 bg-red-500/10"
                : active
                  ? "text-green-400 border-green-500/30 bg-green-500/10"
                  : "text-gray-400 border-gray-700 bg-gray-800/50"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                emergencyStopped ? "bg-red-500" : active ? "bg-green-500 animate-pulse" : "bg-gray-500"
              }`}
              aria-hidden
            />
            {emergencyStopped ? T.status.stoppedLabel : active ? T.status.activeLabel : T.status.offLabel}
          </span>
          {emergencyStopped ? (
            <button
              onClick={() => handleEmergency(false)}
              className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-200 px-3 py-2 rounded-xl`}
            >
              {T.status.resumeButton}
            </button>
          ) : (
            <button
              onClick={() => setConfirmStop(true)}
              className={`${INTERACTION_CLASSES.dangerButton} text-xs text-white px-3 py-2 rounded-xl`}
            >
              {T.status.stopButton}
            </button>
          )}
        </div>
      </div>

      {/* EMERGENCY CONFIRM */}
      {confirmStop && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-sm text-red-400">{T.status.stopConfirm}</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setConfirmStop(false)}
              className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-300 px-3 py-1.5 rounded-lg`}
            >
              Cancel
            </button>
            <button
              onClick={() => handleEmergency(true)}
              className={`${INTERACTION_CLASSES.dangerButton} text-xs text-white px-3 py-1.5 rounded-lg`}
            >
              Confirm stop
            </button>
          </div>
        </div>
      )}

      {/* DISCLAIMER */}
      <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300/90">
        <span aria-hidden>⚠</span>
        <p>{T.disclaimer}</p>
      </div>

      {/* LIVE STATUS */}
      <AutomationStatusCard status={status} />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="card" className="h-40" />
          ))}
        </div>
      ) : (
        <>
          {/* VALIDATION ERRORS */}
          {errors.length > 0 && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-sm font-medium text-red-400 mb-1">Please fix:</p>
              <ul className="list-disc list-inside text-xs text-red-300 space-y-0.5">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* TRADING STATUS */}
            <Card title={T.sections.tradingStatus}>
              <div className="space-y-4">
                <Toggle checked={config.enabled} onChange={(v) => setTop("enabled", v)} label={L.enable} />
                <Field label={L.mode}>
                  <Select value={config.mode} onChange={(v) => setTop("mode", v as AutoTradeConfig["mode"])} options={O.mode} />
                </Field>
                <Toggle checked={config.dryRun} onChange={(v) => setTop("dryRun", v)} label={L.dryRun} />
              </div>
            </Card>

            {/* INSTRUMENT */}
            <Card title={T.sections.instrument}>
              <div className="space-y-4">
                <Field label={L.product}>
                  <Select
                    value={config.instrument.product}
                    onChange={(v) => setSection("instrument", { product: v as AutoTradeConfig["instrument"]["product"] })}
                    options={O.product}
                  />
                </Field>
                <Field label={L.optionType}>
                  <Select
                    value={config.instrument.optionType}
                    onChange={(v) => setSection("instrument", { optionType: v as AutoTradeConfig["instrument"]["optionType"] })}
                    options={O.optionType}
                  />
                </Field>
                <Field label={L.allowedUnderlyings} hint="e.g. NIFTY, BANKNIFTY">
                  <TextInput
                    value={config.instrument.allowedUnderlyings.join(", ")}
                    onChange={(v) =>
                      setSection("instrument", {
                        allowedUnderlyings: v
                          .split(",")
                          .map((s) => s.trim().toUpperCase())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Follow signal (any)"
                  />
                </Field>
              </div>
            </Card>

            {/* EXPIRY */}
            <Card title={T.sections.expiry}>
              <div className="space-y-4">
                <Field label={L.expiry}>
                  <Select
                    value={config.expiry.mode}
                    onChange={(v) => setSection("expiry", { mode: v as AutoTradeConfig["expiry"]["mode"] })}
                    options={O.expiry}
                  />
                </Field>
                {config.expiry.mode === "SPECIFIC" && (
                  <Field label={L.specificExpiry}>
                    <TextInput
                      value={config.expiry.specific ?? ""}
                      onChange={(v) => setSection("expiry", { specific: v || null })}
                      placeholder="2026-08-27"
                    />
                  </Field>
                )}
              </div>
            </Card>

            {/* STRIKE SELECTION */}
            <Card title={T.sections.strike}>
              <div className="space-y-4">
                <Field label={L.strikeMethod}>
                  <Select
                    value={config.strikeSelection.method}
                    onChange={(v) => setSection("strikeSelection", { method: v as AutoTradeConfig["strikeSelection"]["method"] })}
                    options={O.strikeMethod}
                  />
                </Field>
                {config.strikeSelection.method === "DELTA" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={L.targetDelta}>
                      <NumberInput
                        value={config.strikeSelection.targetDelta}
                        step={0.05}
                        min={0}
                        onChange={(v) => setSection("strikeSelection", { targetDelta: v })}
                      />
                    </Field>
                    <Field label={L.maxDeltaDiff}>
                      <NumberInput
                        value={config.strikeSelection.maxDeltaDifference}
                        step={0.01}
                        min={0}
                        onChange={(v) => setSection("strikeSelection", { maxDeltaDifference: v })}
                      />
                    </Field>
                    <div className="col-span-2">
                      <Field label={L.fallback}>
                        <Select
                          value={config.strikeSelection.fallback}
                          onChange={(v) =>
                            setSection("strikeSelection", { fallback: v as AutoTradeConfig["strikeSelection"]["fallback"] })
                          }
                          options={O.fallback}
                        />
                      </Field>
                    </div>
                  </div>
                )}
                {config.strikeSelection.method === "OFFSET" && (
                  <Field label={L.offset} hint="+1 = one strike above ATM, -1 = below">
                    <NumberInput
                      value={config.strikeSelection.offset}
                      onChange={(v) => setSection("strikeSelection", { offset: Math.round(v) })}
                    />
                  </Field>
                )}
                {(config.strikeSelection.method === "ITM" || config.strikeSelection.method === "OTM") && (
                  <Field label={L.itmOtmSteps}>
                    <NumberInput
                      value={config.strikeSelection.itmOtmSteps}
                      min={1}
                      onChange={(v) => setSection("strikeSelection", { itmOtmSteps: Math.round(v) })}
                    />
                  </Field>
                )}
              </div>
            </Card>

            {/* ENTRY */}
            <Card title={T.sections.entry}>
              <div className="space-y-4">
                <Field label={L.entryType}>
                  <Select
                    value={config.entry.type}
                    onChange={(v) => setSection("entry", { type: v as AutoTradeConfig["entry"]["type"] })}
                    options={O.entry}
                  />
                </Field>
                {config.entry.type === "CUSTOM" && (
                  <Field label={L.customPrice}>
                    <NumberInput
                      value={config.entry.customPrice ?? 0}
                      step={0.05}
                      min={0}
                      onChange={(v) => setSection("entry", { customPrice: v })}
                    />
                  </Field>
                )}
              </div>
            </Card>

            {/* QUANTITY */}
            <Card title={T.sections.quantity}>
              <div className="space-y-4">
                <Field label={L.quantityMode}>
                  <Select
                    value={config.quantity.mode}
                    onChange={(v) => setSection("quantity", { mode: v as AutoTradeConfig["quantity"]["mode"] })}
                    options={O.quantityMode}
                  />
                </Field>
                {config.quantity.mode === "LOTS" && (
                  <Field label={L.lots}>
                    <NumberInput value={config.quantity.lots} min={1} onChange={(v) => setSection("quantity", { lots: Math.round(v) })} />
                  </Field>
                )}
                {config.quantity.mode === "FIXED" && (
                  <Field label={L.fixedQty} hint="Rounded down to a whole lot">
                    <NumberInput value={config.quantity.fixedQty} min={1} onChange={(v) => setSection("quantity", { fixedQty: Math.round(v) })} />
                  </Field>
                )}
                {config.quantity.mode === "RISK" && (
                  <Field label={L.riskAmount} hint="Sized against the stop distance">
                    <NumberInput value={config.quantity.riskAmount} min={0} step={100} onChange={(v) => setSection("quantity", { riskAmount: v })} />
                  </Field>
                )}
              </div>
            </Card>

            {/* TARGET */}
            <Card title={T.sections.target}>
              <div className="space-y-4">
                <Field label={L.targetType}>
                  <Select
                    value={config.target.type}
                    onChange={(v) => setSection("target", { type: v as AutoTradeConfig["target"]["type"] })}
                    options={O.targetType}
                  />
                </Field>
                {config.target.type === "RR" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={L.rrRisk}>
                      <NumberInput value={config.riskReward.risk} min={0} step={0.5} onChange={(v) => setSection("riskReward", { risk: v })} />
                    </Field>
                    <Field label={L.rrReward}>
                      <NumberInput value={config.riskReward.reward} min={0} step={0.5} onChange={(v) => setSection("riskReward", { reward: v })} />
                    </Field>
                  </div>
                ) : (
                  <Field label={L.targetValue}>
                    <NumberInput value={config.target.value} min={0} step={config.target.type === "PERCENTAGE" ? 5 : 1} onChange={(v) => setSection("target", { value: v })} />
                  </Field>
                )}
              </div>
            </Card>

            {/* STOP LOSS */}
            <Card title={T.sections.stopLoss}>
              <div className="space-y-4">
                <Field label={L.slType}>
                  <Select
                    value={config.stopLoss.type}
                    onChange={(v) => setSection("stopLoss", { type: v as AutoTradeConfig["stopLoss"]["type"] })}
                    options={O.stopLossType}
                  />
                </Field>
                <Field label={L.slValue}>
                  <NumberInput value={config.stopLoss.value} min={0} step={config.stopLoss.type === "PERCENTAGE" ? 5 : 1} onChange={(v) => setSection("stopLoss", { value: v })} />
                </Field>
              </div>
            </Card>
          </div>

          {/* RISK MANAGEMENT */}
          <Card title={T.sections.risk}>
            <div className="grid gap-5 md:grid-cols-3">
              {/* Trailing */}
              <div className="space-y-3">
                <Toggle checked={config.trailingStop.enabled} onChange={(v) => setSection("trailingStop", { enabled: v })} label={L.trailEnabled} />
                {config.trailingStop.enabled && (
                  <div className="space-y-3 pl-1">
                    <Field label={L.trailType}>
                      <Select
                        value={config.trailingStop.type}
                        onChange={(v) => setSection("trailingStop", { type: v as AutoTradeConfig["trailingStop"]["type"] })}
                        options={O.trailType}
                      />
                    </Field>
                    <Field label={L.trailValue}>
                      <NumberInput value={config.trailingStop.value} min={0} onChange={(v) => setSection("trailingStop", { value: v })} />
                    </Field>
                    <Field label={L.trailActivation}>
                      <NumberInput value={config.trailingStop.activation} min={0} onChange={(v) => setSection("trailingStop", { activation: v })} />
                    </Field>
                  </div>
                )}
              </div>
              {/* Breakeven */}
              <div className="space-y-3">
                <Toggle checked={config.breakeven.enabled} onChange={(v) => setSection("breakeven", { enabled: v })} label={L.beEnabled} />
                {config.breakeven.enabled && (
                  <div className="space-y-3 pl-1">
                    <Field label={L.beActivation} hint="points in profit">
                      <NumberInput value={config.breakeven.activation} min={0} onChange={(v) => setSection("breakeven", { activation: v })} />
                    </Field>
                    <Field label={L.beOffset}>
                      <NumberInput value={config.breakeven.offset} onChange={(v) => setSection("breakeven", { offset: v })} />
                    </Field>
                  </div>
                )}
              </div>
              {/* Duplicate protection */}
              <div className="space-y-3">
                <Toggle
                  checked={config.duplicateProtection.enabled}
                  onChange={(v) => setSection("duplicateProtection", { enabled: v })}
                  label={L.duplicate}
                />
                <p className="text-[11px] text-gray-600">The same signal (id or hash) won&apos;t create a second trade.</p>
              </div>
            </div>
          </Card>

          {/* DAILY LIMITS */}
          <Card title={T.sections.limits}>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <Field label={L.maxTrades}>
                <NumberInput value={config.riskLimits.maxTradesPerDay} min={1} onChange={(v) => setSection("riskLimits", { maxTradesPerDay: Math.round(v) })} />
              </Field>
              <Field label={L.maxDailyLoss}>
                <NumberInput value={config.riskLimits.maxDailyLoss} min={0} step={500} onChange={(v) => setSection("riskLimits", { maxDailyLoss: v })} />
              </Field>
              <Field label={L.maxConsecutive}>
                <NumberInput value={config.riskLimits.maxConsecutiveLosses} min={1} onChange={(v) => setSection("riskLimits", { maxConsecutiveLosses: Math.round(v) })} />
              </Field>
              <Field label={L.maxOpen}>
                <NumberInput value={config.riskLimits.maxOpenPositions} min={1} onChange={(v) => setSection("riskLimits", { maxOpenPositions: Math.round(v) })} />
              </Field>
              <div className="col-span-2">
                <Field label={L.existingPosition}>
                  <Select
                    value={config.existingPositionAction}
                    onChange={(v) => setTop("existingPositionAction", v as AutoTradeConfig["existingPositionAction"])}
                    options={O.existingPosition}
                  />
                </Field>
              </div>
            </div>
          </Card>

          {/* SESSION */}
          <Card title={T.sections.session}>
            <div className="space-y-4">
              <Toggle checked={config.session.enforce} onChange={(v) => setSection("session", { enforce: v })} label={L.sessionEnforce} />
              {config.session.enforce && (
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <Field label={L.sessionStart}>
                    <TextInput value={config.session.start} onChange={(v) => setSection("session", { start: v })} placeholder="09:15" />
                  </Field>
                  <Field label={L.sessionEnd}>
                    <TextInput value={config.session.end} onChange={(v) => setSection("session", { end: v })} placeholder="15:30" />
                  </Field>
                </div>
              )}
            </div>
          </Card>

          {/* SAVE */}
          <div className="flex justify-end sticky bottom-2 z-10">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`${INTERACTION_CLASSES.primaryButton} text-white px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg`}
            >
              {saving ? <ButtonLoader /> : null}
              {saving ? T.buttons.saving : T.buttons.save}
            </button>
          </div>

          {/* TEST / DRY RUN */}
          <TestSignalPanel onDone={refreshStatus} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test signal / dry run panel (spec sections 42–43)
// ---------------------------------------------------------------------------
function TestSignalPanel({ onDone }: { onDone: () => void }) {
  const [symbol, setSymbol] = useState("NIFTY");
  const [direction, setDirection] = useState<"BUY" | "SELL">("BUY");
  const [optionType, setOptionType] = useState<"CE" | "PE" | "">("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ decision: Decision; expiry: string | null; executed: boolean } | null>(null);

  const run = useCallback(
    async (execute: boolean) => {
      setBusy(true);
      setResult(null);
      try {
        const res = await submitTestSignal({ symbol: symbol.toUpperCase(), direction, optionType, strategy: "TEST", execute });
        setResult({ decision: res.decision, expiry: res.expiry, executed: res.executed });
        if (execute && res.executed) {
          showToast("Test trade executed", "success");
          onDone();
        }
      } catch (e) {
        showToast((e as Error).message, "error");
      }
      setBusy(false);
    },
    [symbol, direction, optionType, onDone]
  );

  const plan = result?.decision.plan;

  return (
    <Card title={T.sections.test}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Symbol">
          <TextInput value={symbol} onChange={setSymbol} placeholder="NIFTY" />
        </Field>
        <Field label="Direction">
          <Select
            value={direction}
            onChange={(v) => setDirection(v as "BUY" | "SELL")}
            options={[
              { value: "BUY", label: "BUY" },
              { value: "SELL", label: "SELL" },
            ]}
          />
        </Field>
        <Field label="Option (optional)">
          <Select
            value={optionType}
            onChange={(v) => setOptionType(v as "CE" | "PE" | "")}
            options={[
              { value: "", label: "Follow signal" },
              { value: "CE", label: "CE" },
              { value: "PE", label: "PE" },
            ]}
          />
        </Field>
        <button
          onClick={() => run(false)}
          disabled={busy}
          className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-200 px-4 py-2.5 rounded-xl flex items-center gap-2`}
        >
          {busy ? <ButtonLoader /> : null}
          {T.buttons.runTest}
        </button>
        <button
          onClick={() => run(true)}
          disabled={busy}
          className={`${INTERACTION_CLASSES.primaryButton} text-white text-xs px-4 py-2.5 rounded-xl flex items-center gap-2`}
        >
          {T.buttons.runTestExec}
        </button>
      </div>

      {result && (
        <div className="mt-4 p-4 bg-gray-950/60 border border-gray-800 rounded-xl text-sm">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                T.statusStyles[result.decision.status] ?? T.statusStyles.SKIPPED
              }`}
            >
              {result.executed ? "EXECUTED" : result.decision.status === "DRY_RUN" ? "DRY RUN — WOULD EXECUTE" : result.decision.status}
            </span>
            <span className="text-gray-400 text-xs">{result.decision.reason}</span>
          </div>
          {plan && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-gray-300">
              <span>Contract: <b className="text-white">{plan.symbol} {plan.strike} {plan.optionType}</b></span>
              <span>Expiry: <b className="text-white">{plan.expiry}</b></span>
              {plan.delta != null && <span>Delta: <b className="text-white">{plan.delta}</b></span>}
              <span>Entry: <b className="text-white">₹{plan.entryPrice}</b></span>
              <span>Qty: <b className="text-white">{plan.quantity}</b></span>
              <span>Target: <b className="text-green-400">₹{plan.target}</b></span>
              <span>SL: <b className="text-red-400">₹{plan.stopLoss}</b></span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
