"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatIndianCurrency } from "@/utils/format";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import { AUTO_TRADE_COPY as T } from "@/config/autoTrade";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import { showToast } from "@/components/ui/Toast";
import AutomationStatusCard from "@/components/auto/AutomationStatusCard";
import {
  getDecisions,
  getAutomationStatus,
  decideProposed,
  type AutoTradeDecisionRow,
  type AutomationStatus,
} from "@/services/auto-trade.service";

const D = T.decisions;

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-md border ${T.statusStyles[status] ?? T.statusStyles.SKIPPED}`}>
      {status}
    </span>
  );
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function num(n: number | null, opts?: { currency?: boolean }): string {
  if (n == null) return "—";
  return opts?.currency ? formatIndianCurrency(n) : String(n);
}

export default function DecisionsSection() {
  const [rows, setRows] = useState<AutoTradeDecisionRow[]>([]);
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AutoTradeDecisionRow | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([getDecisions(100), getAutomationStatus().catch(() => null)]);
    setRows(d);
    setStatus(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Async IIFE so setState never fires synchronously in the effect body.
    (async () => {
      await load();
    })();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const act = useCallback(
    async (id: string, action: "approve" | "reject") => {
      setActing(true);
      try {
        const res = await decideProposed(id, action);
        showToast(
          action === "approve"
            ? res.ok
              ? "Trade executed"
              : `Not executed: ${res.reason ?? res.detail ?? res.status}`
            : "Proposal rejected",
          res.ok || action === "reject" ? "success" : "error"
        );
        await load();
        setSelected(null);
      } catch (e) {
        showToast((e as Error).message, "error");
      }
      setActing(false);
    },
    [load]
  );

  return (
    <div className="space-y-4">
      <AutomationStatusCard status={status} />

      <div className="bg-gray-900 border border-gray-800 rounded-xl md:rounded-2xl p-3 md:p-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-sm md:text-base font-semibold text-white">{D.title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{D.subtitle}</p>
          </div>
          <Link
            href="/dashboard/auto"
            className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-200 px-3 py-1.5 rounded-lg hidden sm:inline-block`}
          >
            Configure
          </Link>
        </div>

        {loading ? (
          <Skeleton variant="card" className="h-24 mt-3" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">{D.empty}</p>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                  <th className="py-2 px-2 font-medium">Time</th>
                  <th className="py-2 px-2 font-medium">Symbol</th>
                  <th className="py-2 px-2 font-medium">Dir</th>
                  <th className="py-2 px-2 font-medium">Opt</th>
                  <th className="py-2 px-2 font-medium text-right">Strike</th>
                  <th className="py-2 px-2 font-medium text-right">Δ</th>
                  <th className="py-2 px-2 font-medium text-right">Entry</th>
                  <th className="py-2 px-2 font-medium text-right">Target</th>
                  <th className="py-2 px-2 font-medium text-right">SL</th>
                  <th className="py-2 px-2 font-medium text-right">Qty</th>
                  <th className="py-2 px-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="border-b border-gray-800/60 hover:bg-gray-800/30 cursor-pointer"
                  >
                    <td className="py-2.5 px-2 text-gray-400 text-xs">{fmtTime(r.created_at)}</td>
                    <td className="py-2.5 px-2 text-white font-medium">{r.symbol ?? "—"}</td>
                    <td className="py-2.5 px-2 text-gray-300">{r.direction ?? "—"}</td>
                    <td className="py-2.5 px-2 text-gray-300">{r.option_type ?? "—"}</td>
                    <td className="py-2.5 px-2 text-right text-gray-200">{num(r.strike)}</td>
                    <td className="py-2.5 px-2 text-right text-gray-400">{r.delta != null ? r.delta.toFixed(2) : "—"}</td>
                    <td className="py-2.5 px-2 text-right text-gray-200">{num(r.entry_price, { currency: true })}</td>
                    <td className="py-2.5 px-2 text-right text-green-400">{num(r.target, { currency: true })}</td>
                    <td className="py-2.5 px-2 text-right text-red-400">{num(r.stop_loss, { currency: true })}</td>
                    <td className="py-2.5 px-2 text-right text-gray-200">{num(r.quantity)}</td>
                    <td className="py-2.5 px-2"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={D.detailTitle}>
        {selected && (
          <div className="space-y-4 text-sm">
            {/* Decision */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={selected.status} />
                <span className="text-gray-400 text-xs">{selected.reason}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-300 bg-gray-950/60 border border-gray-800 rounded-lg p-3">
                <span>Mode: <b className="text-white">{selected.mode ?? "—"}</b></span>
                <span>Config: <b className="text-white">v{selected.config_version ?? "—"}</b></span>
                <span>Symbol: <b className="text-white">{selected.symbol ?? "—"}</b></span>
                <span>Contract: <b className="text-white">{selected.strike ?? "—"} {selected.option_type ?? ""}</b></span>
                <span>Expiry: <b className="text-white">{selected.expiry ?? "—"}</b></span>
                {selected.delta != null && <span>Delta: <b className="text-white">{selected.delta}</b></span>}
                <span>Entry: <b className="text-white">{num(selected.entry_price, { currency: true })}</b></span>
                <span>Qty: <b className="text-white">{num(selected.quantity)}</b></span>
                <span>Target: <b className="text-green-400">{num(selected.target, { currency: true })} {selected.target_type ? `(${selected.target_type})` : ""}</b></span>
                <span>SL: <b className="text-red-400">{num(selected.stop_loss, { currency: true })} {selected.stop_loss_type ? `(${selected.stop_loss_type})` : ""}</b></span>
              </div>
            </div>

            {/* Approve / reject for proposals */}
            {selected.status === "PROPOSED" && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => act(selected.id, "approve")}
                  disabled={acting}
                  className={`${INTERACTION_CLASSES.primaryButton} text-white text-xs px-4 py-2 rounded-lg`}
                >
                  {D.approve}
                </button>
                <button
                  onClick={() => act(selected.id, "reject")}
                  disabled={acting}
                  className={`${INTERACTION_CLASSES.dangerButton} text-white text-xs px-4 py-2 rounded-lg`}
                >
                  {D.reject}
                </button>
              </div>
            )}

            {/* Audit trail */}
            {selected.audit_trail && selected.audit_trail.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1.5">{D.auditTitle}</p>
                <ol className="space-y-1">
                  {selected.audit_trail.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span className={a.ok ? "text-green-400" : "text-red-400"}>{a.ok ? "✓" : "✗"}</span>
                      <span className="text-gray-300"><b>{a.step}:</b> {a.detail}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Normalized signal */}
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1.5">{D.normalizedTitle}</p>
              <pre className="text-[11px] text-gray-400 bg-gray-950/60 border border-gray-800 rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(selected.normalized_signal, null, 2)}
              </pre>
            </div>

            {/* Raw payload */}
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1.5">{D.rawTitle}</p>
              <pre className="text-[11px] text-gray-400 bg-gray-950/60 border border-gray-800 rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(selected.raw_payload, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
