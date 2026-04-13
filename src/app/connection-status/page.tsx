"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdmin } from "@/hooks/useAdmin";
import { signOut } from "@/services/auth.service";
import BrandLogo from "@/components/ui/BrandLogo";
import { INTERACTION_CLASSES } from "@/styles/interactions";

interface HealthData {
  dhan: { status: string; message: string; hint: string };
  upstox: { status: string; message: string; tokenExpired: boolean; hint: string };
  primary: string;
  marketStatus: string;
}

interface EnvVar {
  name: string;
  configured: boolean;
  requiredFor: string;
  value?: string;
}

export default function ConnectionStatusPage() {
  const admin = useAdmin();
  const router = useRouter();

  const [health, setHealth] = useState<HealthData | null>(null);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [rawJson, setRawJson] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [testingDhan, setTestingDhan] = useState(false);
  const [testingUpstox, setTestingUpstox] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [istTime, setIstTime] = useState("");
  const [countdown, setCountdown] = useState("");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const [healthRes, envRes] = await Promise.all([
        fetch("/api/market-data/health"),
        fetch("/api/admin/env-status"),
      ]);
      const h = await healthRes.json();
      const e = await envRes.json();
      setHealth(h);
      setRawJson(JSON.stringify(h, null, 2));
      setEnvVars(e.vars ?? []);
      setLastChecked(new Date().toISOString());
    } catch {
      // keep existing data
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch + polling
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Live clock + countdown
  useEffect(() => {
    function tick() {
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      setIstTime(
        now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
      );

      const day = now.getDay();
      const mins = now.getHours() * 60 + now.getMinutes();
      const secs = now.getSeconds();
      const totalSecs = mins * 60 + secs;

      const preOpenSecs = 540 * 60; // 9:00
      const openSecs = 555 * 60; // 9:15
      const closeSecs = 930 * 60; // 15:30

      let label = "";
      let diffSecs = 0;

      if (day === 0 || day === 6) {
        label = "Market closed (weekend)";
      } else if (totalSecs < preOpenSecs) {
        diffSecs = preOpenSecs - totalSecs;
        label = `Pre-open in ${fmtCountdown(diffSecs)}`;
      } else if (totalSecs < openSecs) {
        diffSecs = openSecs - totalSecs;
        label = `Opens in ${fmtCountdown(diffSecs)}`;
      } else if (totalSecs <= closeSecs) {
        diffSecs = closeSecs - totalSecs;
        label = `Closes in ${fmtCountdown(diffSecs)}`;
      } else {
        label = "Market closed for today";
      }
      setCountdown(label);
    }

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Client-side admin guard
  if (!admin.isLoading && !admin.isAdmin) {
    router.replace("/dashboard?error=unauthorized");
    return null;
  }

  if (admin.isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6">
        <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
          <div className="h-8 w-64 bg-gray-800 rounded" />
          <div className="h-20 w-full bg-gray-800 rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-64 bg-gray-800 rounded-2xl" />
            <div className="h-64 bg-gray-800 rounded-2xl" />
          </div>
          <div className="h-40 bg-gray-800 rounded-2xl" />
          <div className="h-48 bg-gray-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchHealth();
  }

  async function handleTestDhan() {
    setTestingDhan(true);
    await fetchHealth();
    setTestingDhan(false);
  }

  async function handleTestUpstox() {
    setTestingUpstox(true);
    await fetchHealth();
    setTestingUpstox(false);
  }

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  function copyJson() {
    navigator.clipboard.writeText(rawJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const dhanOk = health?.dhan?.status === "ok";
  const upstoxOk = health?.upstox?.status === "ok";
  const allOk = dhanOk && upstoxOk;
  const allDown = !dhanOk && !upstoxOk;

  const marketStatusColor = health?.marketStatus === "open"
    ? "text-green-400"
    : health?.marketStatus === "pre-open"
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <BrandLogo />
            <h1 className="text-2xl font-bold text-white mt-2">Connection Status</h1>
            <p className="text-sm text-gray-400">Admin &middot; Data provider monitoring</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs bg-violet-500/10 text-violet-400 border border-violet-500/20 px-3 py-1 rounded-full">
              {admin.email}
            </span>
            {lastChecked && (
              <span className="text-xs text-gray-500">
                Checked: {new Date(lastChecked).toLocaleTimeString("en-IN")}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-300 px-3 py-1.5 rounded-lg`}
            >
              {refreshing ? "Refreshing..." : "Refresh Now"}
            </button>
            <Link
              href="/dashboard"
              className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-300 px-3 py-1.5 rounded-lg`}
            >
              Dashboard
            </Link>
          </div>
        </div>

        {/* Section 1 — Overall Status */}
        {allOk ? (
          <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-400">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
            All Systems Operational
          </div>
        ) : allDown ? (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            Service Disruption &mdash; Both providers unavailable
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-sm text-yellow-400">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            Partial Outage &mdash; One provider unavailable
          </div>
        )}

        {/* Section 2 — Provider Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* DhanHQ */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">DhanHQ</h3>
              <span className="text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-full">
                Primary Provider
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${dhanOk ? "bg-green-400" : "bg-red-400"}`} />
              <span className={`text-lg font-semibold ${dhanOk ? "text-green-400" : "text-red-400"}`}>
                {dhanOk ? "Operational" : "Unavailable"}
              </span>
            </div>
            {health?.dhan?.message && !dhanOk && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                {health.dhan.message}
              </div>
            )}
            {health?.dhan?.hint && !dhanOk && (
              <p className="text-xs text-gray-500">{health.dhan.hint}</p>
            )}
            <button
              onClick={handleTestDhan}
              disabled={testingDhan}
              className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-violet-400 border-violet-500/30 px-4 py-2 rounded-lg w-full`}
            >
              {testingDhan ? "Testing..." : "Test Connection"}
            </button>
          </div>

          {/* Upstox */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Upstox</h3>
              <span className="text-[10px] font-semibold bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full">
                Backup Provider
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${upstoxOk ? "bg-green-400" : "bg-red-400"}`} />
              <span className={`text-lg font-semibold ${upstoxOk ? "text-green-400" : "text-red-400"}`}>
                {upstoxOk ? "Operational" : "Unavailable"}
              </span>
            </div>
            {health?.upstox?.tokenExpired && (
              <span className="inline-block text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
                Token Expired
              </span>
            )}
            {upstoxOk && (
              <span className="inline-block text-[10px] font-semibold bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">
                Token Valid
              </span>
            )}
            {health?.upstox?.message && !upstoxOk && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                {health.upstox.message}
              </div>
            )}
            {health?.upstox?.hint && !upstoxOk && (
              <p className="text-xs text-gray-500">{health.upstox.hint}</p>
            )}
            <button
              onClick={handleTestUpstox}
              disabled={testingUpstox}
              className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-violet-400 border-violet-500/30 px-4 py-2 rounded-lg w-full`}
            >
              {testingUpstox ? "Testing..." : "Test Connection"}
            </button>
          </div>
        </div>

        {/* Section 3 — Market Status */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-base font-bold text-white mb-4">Market Status</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Current IST Time</p>
              <p className="text-lg font-mono font-bold text-white">{istTime}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Market Status</p>
              <p className={`text-lg font-bold capitalize ${marketStatusColor}`}>
                {health?.marketStatus ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Countdown</p>
              <p className="text-lg font-mono font-bold text-violet-400">{countdown}</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-800 grid grid-cols-3 gap-4 text-xs text-gray-500">
            <div>Pre-open: <span className="text-gray-300">9:00 AM IST</span></div>
            <div>Open: <span className="text-gray-300">9:15 AM IST</span></div>
            <div>Close: <span className="text-gray-300">3:30 PM IST</span></div>
          </div>
        </div>

        {/* Section 4 — Environment Variables */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-base font-bold text-white mb-4">Environment Variables</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                  <th className="pb-2 pr-4">Variable</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Required For</th>
                </tr>
              </thead>
              <tbody>
                {envVars.map((v) => (
                  <tr key={v.name} className="border-b border-gray-800/50">
                    <td className="py-2.5 pr-4 font-mono text-xs text-gray-300">{v.name}</td>
                    <td className="py-2.5 pr-4">
                      {v.value !== undefined ? (
                        <span className="text-xs text-violet-400">{v.value}</span>
                      ) : v.configured ? (
                        <span className="text-green-400">&#10003;</span>
                      ) : (
                        <span className="text-red-400">&#10007;</span>
                      )}
                    </td>
                    <td className="py-2.5 text-xs text-gray-500">{v.requiredFor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 5 — Raw JSON */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white">API Response</h3>
            <button
              onClick={copyJson}
              className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-400 px-3 py-1.5 rounded-lg`}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="bg-gray-950 rounded-xl p-4 overflow-x-auto text-xs font-mono text-green-400 leading-relaxed">
            {rawJson || "Loading..."}
          </pre>
        </div>

        {/* Section 6 — Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleTestDhan}
            disabled={testingDhan}
            className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-300 px-4 py-2 rounded-lg`}
          >
            {testingDhan ? "Testing..." : "Test DhanHQ Only"}
          </button>
          <button
            onClick={handleTestUpstox}
            disabled={testingUpstox}
            className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-300 px-4 py-2 rounded-lg`}
          >
            {testingUpstox ? "Testing..." : "Test Upstox Only"}
          </button>
          <a
            href="/api/market-data/health"
            target="_blank"
            rel="noopener noreferrer"
            className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-300 px-4 py-2 rounded-lg`}
          >
            View Raw JSON
          </a>
          <button
            onClick={handleLogout}
            className="cursor-pointer text-xs text-red-400 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/5 px-4 py-2 rounded-lg transition-all duration-200 active:scale-95"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtCountdown(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
