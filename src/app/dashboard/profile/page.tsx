"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FormInput from "@/components/ui/FormInput";
import { useIsMounted } from "@/hooks/useIsMounted";
import Modal from "@/components/ui/Modal";
import { showToast } from "@/components/ui/Toast";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import { profileConfig } from "@/config/profile";
import {
  getCurrentUser,
  getProfile,
  updateProfile,
  updatePassword as updatePasswordService,
  deleteAccount,
} from "@/services/auth.service";
import { validatePassword, validateFullName } from "@/utils/validation";
import type { PasswordStrength } from "@/types/auth";

function getPasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) return "weak";
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (hasSpecial && hasNumber) return "strong";
  return "medium";
}

export default function ProfilePage() {
  const router = useRouter();
  const { sections, fields, buttons, success, errors, confirmations } =
    profileConfig;

  // --- mount + user loading ---
  const mounted = useIsMounted();
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- personal info ---
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFieldErrors, setProfileFieldErrors] = useState<{
    fullName?: string | null;
    phone?: string | null;
  }>({});

  // --- security ---
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdFieldErrors, setPwdFieldErrors] = useState<{
    current?: string | null;
    newPwd?: string | null;
    confirm?: string | null;
  }>({});

  // --- danger zone ---
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeletePwd, setShowDeletePwd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // --- load user + profile ---
  useEffect(() => {
    getCurrentUser().then(async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);
      setUserEmail(user.email ?? "");

      const result = await getProfile(user.id);
      if (result.data) {
        setFullName(result.data.full_name);
        setPhoneNumber(result.data.phone_number ?? "");
        setLastUpdated(result.data.updated_at);
      } else {
        setLoadError(result.error ?? errors.loadFailed);
      }
    });
  }, [router, errors.loadFailed]);

  if (!mounted) return null;

  const userInitial = fullName ? fullName[0].toUpperCase() : "U";

  // --- personal info handlers ---
  function handleEditStart() {
    setEditFullName(fullName);
    setEditPhone(phoneNumber);
    setProfileFieldErrors({});
    setEditMode(true);
  }

  function handleEditCancel() {
    setEditMode(false);
    setProfileFieldErrors({});
  }

  async function handleProfileSave() {
    const nameResult = validateFullName(editFullName);
    const newErrors: typeof profileFieldErrors = {
      fullName: nameResult.error,
    };

    if (editPhone.trim() && !/^\+?[\d\s-]{7,15}$/.test(editPhone.trim())) {
      newErrors.phone = errors.phoneInvalid;
    }

    setProfileFieldErrors(newErrors);
    if (Object.values(newErrors).some((e) => e)) return;

    setProfileSaving(true);
    const result = await updateProfile(userId, {
      full_name: editFullName.trim(),
      phone_number: editPhone.trim(),
    });

    if (result.success) {
      setFullName(editFullName.trim());
      setPhoneNumber(editPhone.trim());
      setLastUpdated(new Date().toISOString());
      setEditMode(false);
      showToast(success.profileUpdated, "success");
    } else {
      showToast(result.error ?? errors.updateFailed, "error");
    }
    setProfileSaving(false);
  }

  // --- security handlers ---
  async function handlePasswordUpdate() {
    const newErrors: typeof pwdFieldErrors = {};

    if (!currentPassword) {
      newErrors.current = "Current password is required.";
    }

    const pwdResult = validatePassword(newPassword);
    newErrors.newPwd = pwdResult.error;

    if (!confirmPwd) {
      newErrors.confirm = "Please confirm your new password.";
    } else if (confirmPwd !== newPassword) {
      newErrors.confirm = "Passwords do not match.";
    }

    setPwdFieldErrors(newErrors);
    if (Object.values(newErrors).some((e) => e)) return;

    setPwdSaving(true);
    const result = await updatePasswordService(
      userEmail,
      currentPassword,
      newPassword
    );

    if (result.success) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPwd("");
      setPwdFieldErrors({});
      showToast(success.passwordUpdated, "success");
    } else {
      showToast(result.error ?? errors.passwordUpdateFailed, "error");
    }
    setPwdSaving(false);
  }

  // --- delete handlers ---
  function handleDeleteModalOpen() {
    setDeleteConfirmText("");
    setDeletePassword("");
    setDeleteError(null);
    setDeleteModalOpen(true);
  }

  async function handleDeleteConfirm() {
    if (deleteConfirmText !== "DELETE") {
      setDeleteError(errors.deleteConfirmationInvalid);
      return;
    }
    if (!deletePassword) {
      setDeleteError(errors.deletePasswordRequired);
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    const result = await deleteAccount(userEmail, deletePassword);

    if (result.success) {
      showToast(success.accountDeleted, "success");
      setDeleteModalOpen(false);
      setTimeout(() => router.push("/"), 1500);
    } else {
      setDeleteError(result.error ?? errors.deleteFailed);
      setDeleting(false);
    }
  }

  // --- password strength ---
  const strength: PasswordStrength = newPassword
    ? getPasswordStrength(newPassword)
    : "weak";

  const strengthColor = {
    weak: "bg-red-500",
    medium: "bg-yellow-500",
    strong: "bg-violet-500",
  };
  const strengthTextColor = {
    weak: "text-red-400",
    medium: "text-yellow-400",
    strong: "text-violet-400",
  };
  const strengthWidth = {
    weak: "w-1/3",
    medium: "w-2/3",
    strong: "w-full",
  };
  const strengthLabels = { weak: "Weak", medium: "Medium", strong: "Strong" };

  // --- format date ---
  function formatDate(iso: string | null) {
    if (!iso) return "Never";
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">
          {profileConfig.pageTitle}
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Last updated: {formatDate(lastUpdated)}
        </p>
      </div>

      {/* Avatar card */}
      <div className="flex items-center gap-5">
        <div className="w-20 h-20 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
          <span className="text-3xl font-bold text-violet-400">
            {userInitial}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-lg font-semibold text-white truncate">
            {fullName || "—"}
          </p>
          <p className="text-sm text-gray-400 truncate">{userEmail}</p>
        </div>
      </div>

      {loadError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {loadError}
        </div>
      )}

      {/* Section 1 — Personal Information */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">
            {sections.personalInfo}
          </h3>
          {!editMode ? (
            <button
              onClick={handleEditStart}
              className={`${INTERACTION_CLASSES.secondaryButton} text-sm text-gray-300 px-4 py-2 rounded-lg`}
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleEditCancel}
                disabled={profileSaving}
                className={`${INTERACTION_CLASSES.secondaryButton} text-sm text-gray-300 px-4 py-2 rounded-lg`}
              >
                Cancel
              </button>
              <button
                onClick={handleProfileSave}
                disabled={profileSaving}
                className={`${INTERACTION_CLASSES.primaryButton} text-sm text-white px-4 py-2 rounded-lg`}
              >
                {profileSaving ? buttons.saving : buttons.saveChanges}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-5">
          {/* Full Name */}
          {editMode ? (
            <FormInput
              label={fields.fullName.label}
              placeholder={fields.fullName.placeholder}
              value={editFullName}
              onChange={(v) => {
                setEditFullName(v);
                setProfileFieldErrors((p) => ({ ...p, fullName: null }));
              }}
              error={profileFieldErrors.fullName}
            />
          ) : (
            <ReadOnlyField
              label={fields.fullName.label}
              value={fullName || "—"}
            />
          )}

          {/* Email — always read-only */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              {fields.email.label}
            </label>
            <div className="relative">
              <input
                type="email"
                value={userEmail}
                readOnly
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3.5 text-gray-500 cursor-not-allowed pr-12"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Phone Number */}
          {editMode ? (
            <div>
              <FormInput
                label={fields.phoneNumber.label}
                placeholder={fields.phoneNumber.placeholder}
                value={editPhone}
                onChange={(v) => {
                  setEditPhone(v);
                  setProfileFieldErrors((p) => ({ ...p, phone: null }));
                }}
                error={profileFieldErrors.phone}
              />
              <p className="mt-1 text-xs text-gray-500">
                Format: {fields.phoneNumber.hint}
              </p>
            </div>
          ) : (
            <ReadOnlyField
              label={fields.phoneNumber.label}
              value={phoneNumber || "—"}
            />
          )}
        </div>
      </div>

      {/* Section 2 — Security */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6">
          {sections.security}
        </h3>

        <div className="space-y-5">
          <FormInput
            label={fields.currentPassword.label}
            placeholder={fields.currentPassword.placeholder}
            value={currentPassword}
            onChange={(v) => {
              setCurrentPassword(v);
              setPwdFieldErrors((p) => ({ ...p, current: null }));
            }}
            error={pwdFieldErrors.current}
            showPasswordToggle
            showPassword={showCurrentPwd}
            onTogglePassword={() => setShowCurrentPwd(!showCurrentPwd)}
          />

          <div>
            <FormInput
              label={fields.newPassword.label}
              placeholder={fields.newPassword.placeholder}
              value={newPassword}
              onChange={(v) => {
                setNewPassword(v);
                setPwdFieldErrors((p) => ({ ...p, newPwd: null }));
              }}
              error={pwdFieldErrors.newPwd}
              showPasswordToggle
              showPassword={showNewPwd}
              onTogglePassword={() => setShowNewPwd(!showNewPwd)}
            />
            {newPassword && (
              <div className="mt-2">
                <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${strengthColor[strength]} ${strengthWidth[strength]}`}
                  />
                </div>
                <p
                  className={`text-xs mt-1 ${strengthTextColor[strength]}`}
                >
                  {strengthLabels[strength]}
                </p>
              </div>
            )}
          </div>

          <FormInput
            label={fields.confirmPassword.label}
            placeholder={fields.confirmPassword.placeholder}
            value={confirmPwd}
            onChange={(v) => {
              setConfirmPwd(v);
              setPwdFieldErrors((p) => ({ ...p, confirm: null }));
            }}
            error={pwdFieldErrors.confirm}
            showPasswordToggle
            showPassword={showConfirmPwd}
            onTogglePassword={() => setShowConfirmPwd(!showConfirmPwd)}
          />

          <button
            onClick={handlePasswordUpdate}
            disabled={pwdSaving}
            className={`${INTERACTION_CLASSES.primaryButton} w-full sm:w-auto text-white font-semibold px-6 py-3 rounded-xl`}
          >
            {pwdSaving ? buttons.updating : buttons.updatePassword}
          </button>
        </div>
      </div>

      {/* Section 3 — Danger Zone */}
      <div className="bg-gray-900 border border-red-500/20 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-red-400 mb-2">
          {sections.dangerZone}
        </h3>
        <p className="text-sm text-gray-400 mb-6">
          {confirmations.deleteWarning}
        </p>
        <button
          onClick={handleDeleteModalOpen}
          className={`${INTERACTION_CLASSES.dangerButton} text-white font-semibold px-6 py-3 rounded-xl`}
        >
          {buttons.deleteAccount}
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => !deleting && setDeleteModalOpen(false)}
        title={confirmations.deleteTitle}
      >
        <div className="space-y-5">
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            {confirmations.deleteWarning}
          </div>

          <p className="text-sm text-gray-400">
            {confirmations.deleteInstruction}
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              {fields.deleteConfirmation.label}
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => {
                setDeleteConfirmText(e.target.value);
                setDeleteError(null);
              }}
              placeholder={fields.deleteConfirmation.placeholder}
              className={`w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 ${INTERACTION_CLASSES.formInput}`}
            />
          </div>

          <FormInput
            label={fields.deletePassword.label}
            placeholder={fields.deletePassword.placeholder}
            value={deletePassword}
            onChange={(v) => {
              setDeletePassword(v);
              setDeleteError(null);
            }}
            showPasswordToggle
            showPassword={showDeletePwd}
            onTogglePassword={() => setShowDeletePwd(!showDeletePwd)}
          />

          {deleteError && (
            <p className="text-sm text-red-400">{deleteError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleting}
              className={`${INTERACTION_CLASSES.secondaryButton} text-gray-300 px-5 py-2.5 rounded-lg text-sm font-medium`}
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={
                deleting ||
                deleteConfirmText !== "DELETE" ||
                !deletePassword
              }
              className={`${INTERACTION_CLASSES.dangerButton} text-white px-5 py-2.5 rounded-lg text-sm font-medium`}
            >
              {deleting ? buttons.deleting : "Delete My Account"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
        {label}
      </label>
      <div className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3.5 text-gray-300">
        {value}
      </div>
    </div>
  );
}
