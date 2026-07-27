"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAdmin } from "@/hooks/useAdmin";
import { listUsers, updateUser } from "@/services/admin-users.service";
import { usersAdminConfig as cfg } from "@/config/users";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import { showToast } from "@/components/ui/Toast";
import { timeAgo } from "@/utils/format";
import type { AdminUser } from "@/types/admin";

export default function UsersAdminPage() {
  const admin = useAdmin();
  const router = useRouter();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    const { users, error } = await listUsers();
    if (error) {
      showToast(error, "error");
    } else {
      setUsers(users);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (admin.isAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
      load();
    }
  }, [admin.isAdmin, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [users, query]);

  const stats = useMemo(() => {
    const active = users.filter((u) => u.is_active).length;
    return { total: users.length, active, inactive: users.length - active };
  }, [users]);

  // Client-side admin guard (server middleware is the real boundary).
  if (!admin.isLoading && !admin.isAdmin) {
    router.replace("/dashboard?error=unauthorized");
    return null;
  }

  async function handleToggleActive(user: AdminUser) {
    setBusyId(user.id);
    const next = !user.is_active;
    const { success, error } = await updateUser(user.id, { active: next });
    if (success) {
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: next } : u))
      );
      showToast(next ? cfg.toasts.activated : cfg.toasts.deactivated, "success");
    } else {
      showToast(error ?? "Update failed.", "error");
    }
    setBusyId(null);
    setConfirmToggle(null);
  }

  function applyEdited(id: string, patch: Partial<AdminUser>) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  if (admin.isLoading || loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-gray-800 rounded" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-20 bg-gray-800 rounded-2xl" />
          <div className="h-20 bg-gray-800 rounded-2xl" />
          <div className="h-20 bg-gray-800 rounded-2xl" />
        </div>
        <div className="h-96 bg-gray-800 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{cfg.title}</h1>
        <p className="text-sm text-gray-400 mt-1">{cfg.subtitle}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label={cfg.stats.total} value={stats.total} tone="neutral" />
        <StatCard label={cfg.stats.active} value={stats.active} tone="green" />
        <StatCard label={cfg.stats.inactive} value={stats.inactive} tone="red" />
      </div>

      {/* Admin note */}
      <div className="text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
        {cfg.adminNote}
      </div>

      {/* Search */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={cfg.search.placeholder}
        className={`${INTERACTION_CLASSES.formInput} w-full sm:max-w-md bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500`}
      />

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                <th className="px-4 py-3 font-medium">{cfg.table.headers.user}</th>
                <th className="px-4 py-3 font-medium">{cfg.table.headers.phone}</th>
                <th className="px-4 py-3 font-medium text-right">{cfg.table.headers.balance}</th>
                <th className="px-4 py-3 font-medium">{cfg.table.headers.status}</th>
                <th className="px-4 py-3 font-medium">{cfg.table.headers.lastSignIn}</th>
                <th className="px-4 py-3 font-medium text-right">{cfg.table.headers.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                    {users.length === 0 ? cfg.table.empty : cfg.table.noResults}
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="border-b border-gray-800/50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">
                          {u.full_name || "—"}
                        </span>
                        {u.is_admin && (
                          <span className="text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-full">
                            {cfg.table.adminBadge}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {u.phone_number || "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300 tabular-nums">
                      {cfg.currency}
                      {Math.round(u.virtual_balance).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          {cfg.table.active}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-red-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          {cfg.table.inactive}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {u.last_sign_in_at
                        ? timeAgo(u.last_sign_in_at)
                        : cfg.table.neverSignedIn}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditing(u)}
                          className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-300 px-3 py-1.5 rounded-lg`}
                        >
                          {cfg.actions.edit}
                        </button>
                        <button
                          onClick={() => setConfirmToggle(u)}
                          disabled={busyId === u.id || (u.is_admin && u.is_active)}
                          title={
                            u.is_admin && u.is_active
                              ? "The admin account cannot be deactivated."
                              : undefined
                          }
                          className={`${
                            u.is_active
                              ? "text-red-400 border-red-500/20 hover:border-red-500/40 hover:bg-red-500/5"
                              : "text-green-400 border-green-500/20 hover:border-green-500/40 hover:bg-green-500/5"
                          } cursor-pointer text-xs border px-3 py-1.5 rounded-lg transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                          {busyId === u.id
                            ? "…"
                            : u.is_active
                              ? cfg.actions.deactivate
                              : cfg.actions.activate}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={(patch) => {
            applyEdited(editing.id, patch);
            setEditing(null);
          }}
        />
      )}

      {confirmToggle && (
        <ConfirmDialog
          title={
            confirmToggle.is_active
              ? cfg.confirm.deactivateTitle
              : cfg.confirm.activateTitle
          }
          message={`${confirmToggle.full_name || confirmToggle.email} — ${
            confirmToggle.is_active
              ? cfg.confirm.deactivateMessage
              : cfg.confirm.activateMessage
          }`}
          confirmLabel={
            confirmToggle.is_active
              ? cfg.confirm.deactivateConfirm
              : cfg.confirm.activateConfirm
          }
          tone={confirmToggle.is_active ? "danger" : "primary"}
          busy={busyId === confirmToggle.id}
          onConfirm={() => handleToggleActive(confirmToggle)}
          onCancel={() => setConfirmToggle(null)}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  tone,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  tone: "danger" | "primary";
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-white">{title}</h2>
        <p className="text-sm text-gray-400">{message}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={busy}
            className={`${INTERACTION_CLASSES.secondaryButton} text-sm text-gray-300 px-4 py-2 rounded-lg`}
          >
            {cfg.confirm.cancel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`${
              tone === "danger"
                ? INTERACTION_CLASSES.dangerButton
                : INTERACTION_CLASSES.primaryButton
            } text-sm text-white px-4 py-2 rounded-lg`}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "green" | "red";
}) {
  const color =
    tone === "green"
      ? "text-green-400"
      : tone === "red"
        ? "text-red-400"
        : "text-white";
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: (patch: Partial<AdminUser>) => void;
}) {
  const [fullName, setFullName] = useState(user.full_name);
  const [phone, setPhone] = useState(user.phone_number ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSaveClick() {
    if (password && password.length < 6) {
      setError(cfg.edit.passwordHint);
      return;
    }
    setError(null);
    setConfirming(true);
  }

  async function handleConfirmSave() {
    setSaving(true);
    setError(null);
    const update: {
      full_name?: string;
      phone_number?: string;
      password?: string;
    } = {
      full_name: fullName.trim(),
      phone_number: phone.trim(),
    };
    if (password) update.password = password;

    const { success, error } = await updateUser(user.id, update);
    setSaving(false);
    if (success) {
      showToast(cfg.toasts.saved, "success");
      onSaved({ full_name: fullName.trim(), phone_number: phone.trim() || null });
    } else {
      setConfirming(false);
      setError(error ?? "Update failed.");
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={saving ? undefined : onClose}
      >
        <div
          className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
        <div>
          <h2 className="text-lg font-bold text-white">{cfg.edit.title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{user.email}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              {cfg.edit.fullNameLabel}
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={cfg.edit.fullNamePlaceholder}
              className={`${INTERACTION_CLASSES.formInput} w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600`}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              {cfg.edit.phoneLabel}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={cfg.edit.phonePlaceholder}
              className={`${INTERACTION_CLASSES.formInput} w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600`}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              {cfg.edit.passwordLabel}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={cfg.edit.passwordPlaceholder}
                autoComplete="new-password"
                className={`${INTERACTION_CLASSES.formInput} w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-gray-600`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-violet-400 cursor-pointer transition-colors duration-200 p-1"
              >
                {showPassword ? (
                  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" strokeWidth={2} />
                  </svg>
                ) : (
                  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M1 1l22 22" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[11px] text-gray-600 mt-1">{cfg.edit.passwordHint}</p>
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={saving}
            className={`${INTERACTION_CLASSES.secondaryButton} text-sm text-gray-300 px-4 py-2 rounded-lg`}
          >
            {cfg.edit.cancel}
          </button>
          <button
            onClick={handleSaveClick}
            disabled={saving}
            className={`${INTERACTION_CLASSES.primaryButton} text-sm text-white px-4 py-2 rounded-lg`}
          >
            {saving ? cfg.edit.saving : cfg.edit.save}
          </button>
        </div>
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title={cfg.confirm.saveTitle}
          message={cfg.confirm.saveMessage}
          confirmLabel={cfg.confirm.saveConfirm}
          tone="primary"
          busy={saving}
          onConfirm={handleConfirmSave}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
