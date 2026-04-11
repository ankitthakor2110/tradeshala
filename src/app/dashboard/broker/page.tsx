"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { showToast } from "@/components/ui/Toast";
import { useIsMounted } from "@/hooks/useIsMounted";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import { BROKERS, BROKER_PAGE_CONFIG } from "@/config/brokers";
import { getCurrentUser } from "@/services/auth.service";
import {
  getActiveBroker,
  getAllBrokerConnections,
  saveBrokerCredentials,
  testBrokerConnection,
  activateBroker,
  deactivateBroker,
  deleteBrokerConnection,
} from "@/services/broker.service";
import type { BrokerConfig, BrokerConnection } from "@/types/database";

const cfg = BROKER_PAGE_CONFIG;

// --- Friendly error parser ---
function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid") || lower.includes("unauthorized") || lower.includes("401"))
    return "Invalid or expired token. Please generate a new access token.";
  if (lower.includes("403") || lower.includes("forbidden"))
    return "Access denied. Please check your API permissions.";
  if (lower.includes("network") || lower.includes("fetch"))
    return "Network error. Please check your internet connection.";
  if (lower.includes("timeout"))
    return "Connection timed out. Please try again.";
  if (lower.includes("rate") || lower.includes("429"))
    return "Too many requests. Please wait a moment and try again.";
  if (raw.length > 120) return "Connection failed. Please check your credentials and try again.";
  return raw;
}

// --- Token expiry helpers ---
function getTokenExpiryStatus(
  connection: BrokerConnection | null
): "ok" | "expiring" | "expired" | "unknown" {
  if (!connection?.token_expiry) return "unknown";
  const expiry = new Date(connection.token_expiry).getTime();
  const now = Date.now();
  if (now >= expiry) return "expired";
  if (expiry - now < 60 * 60 * 1000) return "expiring";
  return "ok";
}

// --- OAuth URL builder (non-OAuth brokers) ---
const BROKER_TOKEN_URLS: Record<string, string> = {
  dhan: "https://dhanhq.co/docs/latest",
  angelone: "https://smartapi.angelbroking.com/docs",
  groww: "https://groww.in/developer",
};

const BROKER_TOKEN_NOTES: Record<string, string> = {
  dhan: "Dhan tokens have a longer validity and don't expire daily.",
  angelone: "You'll need your TOTP secret from the AngelOne app for 2FA.",
  groww: "Generate your access token from the Groww developer settings page.",
};

// --- Main component ---
export default function BrokerPage() {
  return (
    <Suspense>
      <BrokerPageContent />
    </Suspense>
  );
}

function BrokerPageContent() {
  const mounted = useIsMounted();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [userId, setUserId] = useState("");
  const [connections, setConnections] = useState<BrokerConnection[]>([]);
  const [activeBroker, setActiveBroker] = useState<BrokerConnection | null>(null);

  // config panel
  const [openBrokerId, setOpenBrokerId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testPassed, setTestPassed] = useState<boolean | null>(null);
  const [testMessage, setTestMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // OAuth state
  const [oauthStep, setOauthStep] = useState<1 | 2>(1);
  const [manualTokenMode, setManualTokenMode] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  // disconnect confirm
  const [disconnectTarget, setDisconnectTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // switch confirm
  const [switchConfirm, setSwitchConfirm] = useState<{
    connectionId: string;
    brokerName: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    const user = await getCurrentUser();
    if (!user) return;
    setUserId(user.id);
    const [active, all] = await Promise.all([
      getActiveBroker(user.id),
      getAllBrokerConnections(user.id),
    ]);
    setActiveBroker(active);
    setConnections(all);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch on mount
    loadData();
  }, [loadData]);

  // Handle OAuth callback params
  useEffect(() => {
    const status = searchParams.get("status");
    const broker = searchParams.get("broker");
    const message = searchParams.get("message");

    if (status === "success" && broker) {
      showToast(`Connected to ${broker} via OAuth!`, "success");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reload data after OAuth redirect
      loadData();
      router.replace("/dashboard/broker");
    } else if (status === "error") {
      showToast(friendlyError(message ?? "OAuth flow failed"), "error");
      router.replace("/dashboard/broker");
    }
  }, [searchParams, loadData, router]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  if (!mounted) return null;

  // helpers
  function getConnection(brokerId: string): BrokerConnection | undefined {
    return connections.find((c) => c.broker_id === brokerId);
  }

  function connectionStatus(brokerId: string): "active" | "saved" | "none" {
    const conn = getConnection(brokerId);
    if (!conn) return "none";
    if (conn.is_active && conn.is_connected) return "active";
    return "saved";
  }

  function timeAgo(iso: string | null): string {
    if (!iso) return "Never";
    const diff = now - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
    return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) > 1 ? "s" : ""} ago`;
  }

  // open config panel
  function handleConfigure(broker: BrokerConfig) {
    const conn = getConnection(broker.id);
    const creds: Record<string, string> = {};
    broker.fields.forEach((f) => {
      creds[f.key] = (conn as unknown as Record<string, string>)?.[f.key] ?? "";
    });
    setCredentials(creds);
    setTestPassed(null);
    setTestMessage("");
    setGuideOpen(false);
    setManualTokenMode(false);
    // For OAuth brokers, determine step based on saved creds
    if (broker.authType === "oauth") {
      const hasKeyAndSecret = creds.api_key && creds.api_secret;
      setOauthStep(hasKeyAndSecret ? 2 : 1);
    } else {
      setOauthStep(1);
    }
    setOpenBrokerId(broker.id);
  }

  function handleClosePanel() {
    setOpenBrokerId(null);
    setTestPassed(null);
    setTestMessage("");
    setCredentials({});
    setOauthStep(1);
    setManualTokenMode(false);
  }

  // test connection
  async function handleTest(broker: BrokerConfig) {
    setTesting(true);
    setTestPassed(null);
    setTestMessage("");
    const result = await testBrokerConnection(broker.id, credentials);
    setTestPassed(result.success);
    setTestMessage(result.success ? "" : friendlyError(result.message));
    setTesting(false);
  }

  // OAuth: save key+secret (step 1)
  async function handleSaveOAuthStep1(broker: BrokerConfig) {
    setSaving(true);
    const result = await saveBrokerCredentials(userId, broker.id, broker.name, {
      api_key: credentials.api_key ?? "",
      api_secret: credentials.api_secret ?? "",
    });
    setSaving(false);
    if (result.success) {
      await loadData();
      setOauthStep(2);
      showToast("Credentials saved. Now generate your access token.", "success");
    } else {
      showToast(result.error ?? "Save failed", "error");
    }
  }

  // OAuth: initiate login
  async function handleOAuthLogin(brokerId: string) {
    setOauthLoading(true);
    try {
      const res = await fetch(`/api/broker/oauth/initiate?broker_id=${brokerId}`);
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        showToast(friendlyError(data.error ?? "Failed to start OAuth"), "error");
        setOauthLoading(false);
      }
    } catch {
      showToast("Failed to initiate login. Please try again.", "error");
      setOauthLoading(false);
    }
  }

  // save & connect (non-OAuth or manual token)
  async function handleSaveConnect(broker: BrokerConfig) {
    if (activeBroker && activeBroker.broker_id !== broker.id) {
      const conn = getConnection(broker.id);
      if (!conn) {
        setSaving(true);
        const saveResult = await saveBrokerCredentials(
          userId, broker.id, broker.name, credentials
        );
        setSaving(false);
        if (!saveResult.success) {
          showToast(saveResult.error ?? "Save failed", "error");
          return;
        }
        await loadData();
      }
      const updated = connections.find((c) => c.broker_id === broker.id);
      setSwitchConfirm({ connectionId: updated?.id ?? "", brokerName: broker.name });
      return;
    }
    await doSaveAndActivate(broker);
  }

  async function doSaveAndActivate(broker: BrokerConfig) {
    setSaving(true);
    const saveResult = await saveBrokerCredentials(
      userId, broker.id, broker.name, credentials
    );
    if (!saveResult.success) {
      showToast(saveResult.error ?? "Save failed", "error");
      setSaving(false);
      return;
    }
    const all = await getAllBrokerConnections(userId);
    const conn = all.find((c) => c.broker_id === broker.id);
    if (conn) {
      const activateResult = await activateBroker(userId, conn.id);
      if (!activateResult.success) {
        showToast(activateResult.error ?? "Activation failed", "error");
        setSaving(false);
        return;
      }
    }
    await loadData();
    setSaving(false);
    handleClosePanel();
    showToast(`Connected to ${broker.name}!`, "success");
  }

  async function handleConfirmSwitch() {
    if (!switchConfirm) return;
    setSaving(true);
    const result = await activateBroker(userId, switchConfirm.connectionId);
    if (result.success) {
      await loadData();
      handleClosePanel();
      showToast(`Switched to ${switchConfirm.brokerName}!`, "success");
    } else {
      showToast(result.error ?? "Switch failed", "error");
    }
    setSaving(false);
    setSwitchConfirm(null);
  }

  async function handleDisconnect() {
    if (!disconnectTarget) return;
    setSaving(true);
    const result = await deactivateBroker(userId, disconnectTarget.id);
    if (result.success) {
      await loadData();
      showToast(`Disconnected from ${disconnectTarget.name}`, "info");
    } else {
      showToast(result.error ?? "Disconnect failed", "error");
    }
    setSaving(false);
    setDisconnectTarget(null);
  }

  async function handleDelete(connectionId: string, brokerName: string) {
    const result = await deleteBrokerConnection(connectionId);
    if (result.success) {
      await loadData();
      handleClosePanel();
      showToast(`Removed ${brokerName} credentials`, "info");
    } else {
      showToast(result.error ?? "Delete failed", "error");
    }
  }

  const authTypeBadge: Record<string, string> = {
    oauth: "OAuth",
    apikey: "API Key",
    token: "Token",
  };

  // Token expiry for active broker
  const expiryStatus = getTokenExpiryStatus(activeBroker);
  const activeBrokerConfig = BROKERS.find((b) => b.id === activeBroker?.broker_id);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">{cfg.title}</h2>
        <p className="text-gray-400 mt-1">{cfg.subtitle}</p>
      </div>

      {/* Token expiry warnings */}
      {activeBroker && expiryStatus === "expiring" && activeBrokerConfig?.authType === "oauth" && (
        <button
          onClick={() => handleOAuthLogin(activeBroker.broker_id)}
          className="w-full flex items-center gap-3 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl text-sm text-orange-400 cursor-pointer hover:border-orange-500/40 transition-colors duration-200 text-left"
        >
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Your <span className="font-semibold">{activeBroker.broker_name}</span> token expires soon.
            Click here to refresh it.
          </span>
        </button>
      )}

      {activeBroker && expiryStatus === "expired" && activeBrokerConfig?.authType === "oauth" && (
        <button
          onClick={() => handleOAuthLogin(activeBroker.broker_id)}
          className="w-full flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 cursor-pointer hover:border-red-500/40 transition-colors duration-200 text-left"
        >
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span>
            Your <span className="font-semibold">{activeBroker.broker_name}</span> token has expired.
            Please reconnect to restore live data.
          </span>
        </button>
      )}

      {/* Status banner */}
      {activeBroker && expiryStatus !== "expired" ? (
        <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-400">
          <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shrink-0" />
          <span>
            Connected to <span className="font-semibold">{activeBroker.broker_name}</span>{" "}
            &middot; Live data active &middot; Last synced: {timeAgo(activeBroker.last_connected_at)}
          </span>
        </div>
      ) : !activeBroker ? (
        <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-sm text-yellow-400">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          No broker connected &middot; Connect a broker to get live market data
        </div>
      ) : null}

      {/* Broker grid */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Available Brokers</h3>
        <p className="text-sm text-gray-400 mb-4">{cfg.rule}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BROKERS.map((broker) => {
            const status = connectionStatus(broker.id);
            const conn = getConnection(broker.id);
            const isOpen = openBrokerId === broker.id;

            return (
              <div key={broker.id} className="space-y-0">
                <div
                  className={`bg-gray-900 border rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 ${
                    isOpen
                      ? "border-violet-500/40 rounded-b-none"
                      : status === "active"
                        ? "border-green-500/30"
                        : "border-gray-800 hover:border-violet-500/30"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-3xl">{broker.logo}</span>
                    {status === "active" && (
                      <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                    )}
                  </div>

                  <h4 className="text-base font-bold text-white">{broker.name}</h4>
                  <p className="text-xs text-gray-400 mt-1 mb-3">{broker.description}</p>

                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] font-semibold uppercase tracking-wider bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                      {authTypeBadge[broker.authType]}
                    </span>
                    <StatusBadge status={status} />
                  </div>

                  {status === "active" && conn && (
                    <p className="text-[11px] text-gray-500 mb-3">
                      {cfg.lastConnected}: {timeAgo(conn.last_connected_at)}
                    </p>
                  )}

                  <div className="flex gap-2">
                    {status === "active" ? (
                      <>
                        <button
                          onClick={() => handleConfigure(broker)}
                          className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-300 px-3 py-1.5 rounded-lg flex-1`}
                        >
                          Re-configure
                        </button>
                        <button
                          onClick={() => setDisconnectTarget({ id: conn!.id, name: broker.name })}
                          className="cursor-pointer text-xs text-red-400 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/5 px-3 py-1.5 rounded-lg transition-all duration-200 active:scale-95 flex-1"
                        >
                          {cfg.disconnectButton}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleConfigure(broker)}
                          className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-300 px-3 py-1.5 rounded-lg flex-1`}
                        >
                          Configure
                        </button>
                        <a
                          href={broker.apiDocsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-400 px-3 py-1.5 rounded-lg text-center flex-1`}
                        >
                          Visit Docs
                        </a>
                      </>
                    )}
                  </div>
                </div>

                {/* Configuration panel */}
                {isOpen && (
                  <ConfigPanel
                    broker={broker}
                    credentials={credentials}
                    setCredentials={setCredentials}
                    testing={testing}
                    testPassed={testPassed}
                    testMessage={testMessage}
                    saving={saving}
                    guideOpen={guideOpen}
                    setGuideOpen={setGuideOpen}
                    status={status}
                    oauthStep={oauthStep}
                    manualTokenMode={manualTokenMode}
                    setManualTokenMode={setManualTokenMode}
                    oauthLoading={oauthLoading}
                    onTest={() => handleTest(broker)}
                    onSaveConnect={() => handleSaveConnect(broker)}
                    onSaveOAuthStep1={() => handleSaveOAuthStep1(broker)}
                    onOAuthLogin={() => handleOAuthLogin(broker.id)}
                    onClose={handleClosePanel}
                    onDelete={conn ? () => handleDelete(conn.id, broker.name) : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Broker detail */}
      {activeBroker && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Live Data Status</h3>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{activeBrokerConfig?.logo}</span>
              <div>
                <p className="font-semibold text-white">{activeBroker.broker_name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-green-400">Connected</span>
                </div>
              </div>
            </div>
            <div className="sm:ml-auto flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <span>Last sync: {timeAgo(activeBroker.last_connected_at)}</span>
              <span>&middot;</span>
              <span>Refresh: every 1 min</span>
            </div>
            <div className="flex gap-2 sm:ml-4">
              <button
                onClick={loadData}
                className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-300 px-3 py-1.5 rounded-lg`}
              >
                Refresh Now
              </button>
              <button
                onClick={() => setDisconnectTarget({ id: activeBroker.id, name: activeBroker.broker_name })}
                className="cursor-pointer text-xs text-red-400 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/5 px-3 py-1.5 rounded-lg transition-all duration-200 active:scale-95"
              >
                {cfg.disconnectButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security section */}
      <div className="bg-gray-900 border border-violet-500/20 rounded-2xl p-6">
        <h3 className="text-base font-semibold text-white mb-3">Security Information</h3>
        <ul className="space-y-2">
          {[
            "API credentials are encrypted using AES-256",
            "Credentials are never exposed to the client",
            "Only read-only API access is used",
            "You can disconnect and delete credentials anytime",
            "We never execute real trades on your behalf",
          ].map((point) => (
            <li key={point} className="flex items-start gap-2 text-sm text-gray-400">
              <svg className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              {point}
            </li>
          ))}
        </ul>
      </div>

      {/* Disconnect modal */}
      <Modal isOpen={!!disconnectTarget} onClose={() => !saving && setDisconnectTarget(null)} title="Disconnect Broker">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Are you sure you want to disconnect <span className="text-white font-medium">{disconnectTarget?.name}</span>? Live market data will stop.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDisconnectTarget(null)} disabled={saving} className={`${INTERACTION_CLASSES.secondaryButton} text-sm text-gray-300 px-4 py-2 rounded-lg`}>Cancel</button>
            <button onClick={handleDisconnect} disabled={saving} className={`${INTERACTION_CLASSES.dangerButton} text-sm text-white px-4 py-2 rounded-lg`}>{saving ? "Disconnecting..." : "Disconnect"}</button>
          </div>
        </div>
      </Modal>

      {/* Switch modal */}
      <Modal isOpen={!!switchConfirm} onClose={() => !saving && setSwitchConfirm(null)} title="Switch Broker">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            This will disconnect <span className="text-white font-medium">{activeBroker?.broker_name}</span> and switch to <span className="text-white font-medium">{switchConfirm?.brokerName}</span>. Continue?
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setSwitchConfirm(null)} disabled={saving} className={`${INTERACTION_CLASSES.secondaryButton} text-sm text-gray-300 px-4 py-2 rounded-lg`}>Cancel</button>
            <button onClick={handleConfirmSwitch} disabled={saving} className={`${INTERACTION_CLASSES.primaryButton} text-sm text-white px-4 py-2 rounded-lg`}>{saving ? "Switching..." : "Switch Broker"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// --- Sub-components ---

function StatusBadge({ status }: { status: "active" | "saved" | "none" }) {
  if (status === "active")
    return <span className="text-[10px] font-semibold bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">Connected</span>;
  if (status === "saved")
    return <span className="text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-full">Saved</span>;
  return <span className="text-[10px] font-semibold bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">Not Connected</span>;
}

function ConfigPanel({
  broker,
  credentials,
  setCredentials,
  testing,
  testPassed,
  testMessage,
  saving,
  guideOpen,
  setGuideOpen,
  status,
  oauthStep,
  manualTokenMode,
  setManualTokenMode,
  oauthLoading,
  onTest,
  onSaveConnect,
  onSaveOAuthStep1,
  onOAuthLogin,
  onClose,
  onDelete,
}: {
  broker: BrokerConfig;
  credentials: Record<string, string>;
  setCredentials: (c: Record<string, string>) => void;
  testing: boolean;
  testPassed: boolean | null;
  testMessage: string;
  saving: boolean;
  guideOpen: boolean;
  setGuideOpen: (v: boolean) => void;
  status: "active" | "saved" | "none";
  oauthStep: 1 | 2;
  manualTokenMode: boolean;
  setManualTokenMode: (v: boolean) => void;
  oauthLoading: boolean;
  onTest: () => void;
  onSaveConnect: () => void;
  onSaveOAuthStep1: () => void;
  onOAuthLogin: () => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});
  const isOAuth = broker.authType === "oauth";
  const isDirectToken = !isOAuth;

  // For OAuth brokers, split fields into step 1 (key/secret) and step 2 (access_token)
  const step1Fields = isOAuth
    ? broker.fields.filter((f) => f.key !== "access_token")
    : [];
  const tokenField = isOAuth
    ? broker.fields.find((f) => f.key === "access_token")
    : null;

  function renderField(field: { key: string; label: string; type: "text" | "password"; placeholder: string; helpText: string }) {
    const isPassword = field.type === "password";
    const showing = showFields[field.key] ?? false;

    return (
      <div key={field.key}>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
          {field.label}
        </label>
        <div className="relative">
          <input
            type={isPassword && !showing ? "password" : "text"}
            value={credentials[field.key] ?? ""}
            onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
            placeholder={field.placeholder}
            className={`w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 ${INTERACTION_CLASSES.formInput} ${isPassword ? "pr-12" : ""}`}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowFields({ ...showFields, [field.key]: !showing })}
              className={`${INTERACTION_CLASSES.iconButton} absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-violet-400`}
            >
              {showing ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" strokeWidth={2} />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M1 1l22 22" />
                </svg>
              )}
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-500 mt-1">{field.helpText}</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-violet-500/40 border-t-0 rounded-b-2xl p-6 animate-[slideUp_200ms_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-sm font-semibold text-white">{broker.name} Configuration</h4>
        <button onClick={onClose} className={`${INTERACTION_CLASSES.iconButton} text-gray-400 hover:text-white`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Setup guide */}
      <div className="mb-5">
        <button
          onClick={() => setGuideOpen(!guideOpen)}
          className="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 cursor-pointer transition-colors duration-200"
        >
          <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${guideOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {BROKER_PAGE_CONFIG.setupGuideTitle}
        </button>

        {guideOpen && (
          <div className="mt-3 pl-5 space-y-2">
            {broker.setupSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="w-5 h-5 rounded-full bg-violet-500/10 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                <span className="text-gray-400 pt-0.5">{step}</span>
              </div>
            ))}
            <a href={broker.apiDocsUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-violet-400 hover:text-violet-300 hover:underline underline-offset-4 mt-2 cursor-pointer transition-colors duration-200">
              View official API docs &rarr;
            </a>
            <p className="text-[11px] text-red-400/70 mt-1">Never share your API credentials with anyone.</p>
          </div>
        )}
      </div>

      {/* === OAuth Flow (Upstox / Zerodha) === */}
      {isOAuth && (
        <div className="space-y-5">
          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-2">
            <div className={`flex items-center gap-1.5 text-xs font-medium ${oauthStep === 1 ? "text-violet-400" : "text-gray-500"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${oauthStep === 1 ? "bg-violet-500/20 text-violet-400" : "bg-gray-800 text-gray-500"}`}>1</span>
              API Credentials
            </div>
            <div className="w-6 h-px bg-gray-700" />
            <div className={`flex items-center gap-1.5 text-xs font-medium ${oauthStep === 2 ? "text-violet-400" : "text-gray-500"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${oauthStep === 2 ? "bg-violet-500/20 text-violet-400" : "bg-gray-800 text-gray-500"}`}>2</span>
              Access Token
            </div>
          </div>

          {/* Step 1: API Key & Secret */}
          {oauthStep === 1 && (
            <>
              <div className="space-y-4">
                {step1Fields.map(renderField)}
              </div>
              <button
                onClick={onSaveOAuthStep1}
                disabled={saving || step1Fields.some((f) => !credentials[f.key])}
                className={`${INTERACTION_CLASSES.primaryButton} text-xs text-white px-5 py-2.5 rounded-lg`}
              >
                {saving ? "Saving..." : "Save & Continue"}
              </button>
            </>
          )}

          {/* Step 2: Generate Access Token */}
          {oauthStep === 2 && (
            <>
              {/* Info box */}
              <div className="flex items-start gap-3 p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl text-sm text-violet-400">
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Access tokens expire daily at midnight IST. You need to regenerate it every day.</span>
              </div>

              {/* OAuth login button */}
              <button
                onClick={onOAuthLogin}
                disabled={oauthLoading}
                className={`${INTERACTION_CLASSES.primaryButton} w-full text-white font-semibold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2`}
              >
                {oauthLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  <>Login with {broker.name}</>
                )}
              </button>

              {/* Manual token toggle */}
              <div className="text-center">
                <button
                  onClick={() => setManualTokenMode(!manualTokenMode)}
                  className="text-xs text-gray-500 hover:text-violet-400 cursor-pointer transition-colors duration-200"
                >
                  {manualTokenMode ? "Hide manual entry" : "Already have a token? Enter manually"}
                </button>
              </div>

              {/* Manual token input */}
              {manualTokenMode && tokenField && (
                <div className="space-y-4">
                  {renderField(tokenField)}

                  {/* Test + Save */}
                  {testPassed !== null && (
                    <div className={`flex items-start gap-3 p-4 rounded-xl text-sm ${testPassed ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
                      <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={testPassed ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} />
                      </svg>
                      {testPassed ? "Connection successful!" : testMessage || "Invalid or expired token. Please generate a new access token."}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={onTest}
                      disabled={testing || !credentials.access_token}
                      className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-violet-400 border-violet-500/30 px-4 py-2 rounded-lg`}
                    >
                      {testing ? <span className="flex items-center gap-2"><span className="w-3 h-3 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />Testing...</span> : BROKER_PAGE_CONFIG.testButton}
                    </button>
                    <button
                      onClick={onSaveConnect}
                      disabled={saving || !testPassed}
                      className={`${INTERACTION_CLASSES.primaryButton} text-xs text-white px-4 py-2 rounded-lg`}
                    >
                      {saving ? <span className="flex items-center gap-2"><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Connecting...</span> : BROKER_PAGE_CONFIG.saveButton}
                    </button>
                  </div>
                </div>
              )}

              {/* Token refresh reminder */}
              <div className="flex items-start gap-3 p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl text-xs text-violet-400/80">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-semibold text-violet-400 mb-1">Daily Token Refresh Required</p>
                  <p>{broker.name} access tokens expire at midnight IST every day. You&apos;ll need to click &quot;Login with {broker.name}&quot; each morning to refresh your token and restore live data.</p>
                </div>
              </div>
            </>
          )}

          {status === "saved" && onDelete && (
            <button onClick={onDelete} className="cursor-pointer text-xs text-red-400 hover:text-red-300 px-4 py-2 transition-colors duration-200 active:scale-95">
              Remove
            </button>
          )}
        </div>
      )}

      {/* === Direct Token Flow (Dhan, AngelOne, Groww) === */}
      {isDirectToken && (
        <div className="space-y-5">
          {/* Broker-specific tips */}
          {BROKER_TOKEN_NOTES[broker.id] && (
            <div className="flex items-start gap-3 p-4 bg-gray-800/50 border border-gray-700 rounded-xl text-xs text-gray-400">
              <svg className="w-4 h-4 shrink-0 mt-0.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-gray-300 mb-1">Setup Tip</p>
                <p>{BROKER_TOKEN_NOTES[broker.id]}</p>
                {BROKER_TOKEN_URLS[broker.id] && (
                  <a href={BROKER_TOKEN_URLS[broker.id]} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-violet-400 hover:text-violet-300 hover:underline underline-offset-4 cursor-pointer transition-colors duration-200">
                    Open {broker.name} developer portal &rarr;
                  </a>
                )}
              </div>
            </div>
          )}

          {/* All credential fields */}
          <div className="space-y-4">
            {broker.fields.map(renderField)}
          </div>

          <p className="text-[11px] text-gray-500">{BROKER_PAGE_CONFIG.securityNote}</p>

          {/* Test result */}
          {testPassed !== null && (
            <div className={`flex items-start gap-3 p-4 rounded-xl text-sm ${testPassed ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={testPassed ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} />
              </svg>
              {testPassed ? "Connection successful!" : testMessage || "Invalid or expired token. Please generate a new access token."}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onTest}
              disabled={testing || broker.fields.some((f) => !credentials[f.key])}
              className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-violet-400 border-violet-500/30 px-4 py-2 rounded-lg`}
            >
              {testing ? <span className="flex items-center gap-2"><span className="w-3 h-3 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />Testing...</span> : BROKER_PAGE_CONFIG.testButton}
            </button>
            <button
              onClick={onSaveConnect}
              disabled={saving || !testPassed}
              className={`${INTERACTION_CLASSES.primaryButton} text-xs text-white px-4 py-2 rounded-lg`}
            >
              {saving ? <span className="flex items-center gap-2"><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Connecting...</span> : BROKER_PAGE_CONFIG.saveButton}
            </button>
            {status === "saved" && onDelete && (
              <button onClick={onDelete} className="cursor-pointer text-xs text-red-400 hover:text-red-300 px-4 py-2 transition-colors duration-200 active:scale-95">
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
