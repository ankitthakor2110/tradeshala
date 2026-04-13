"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FormInput from "@/components/ui/FormInput";
import BrandLogo from "@/components/ui/BrandLogo";
import Modal from "@/components/ui/Modal";
import TermsContent from "@/components/legal/TermsContent";
import PrivacyContent from "@/components/legal/PrivacyContent";
import { authConfig } from "@/config/auth";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import {
  validateEmail,
  validatePassword,
  validateFullName,
} from "@/utils/validation";
import { signUp } from "@/services/auth.service";
import type { SignupFormData } from "@/types/auth";

export default function SignupPage() {
  const { signup, errors, loading, loginPanel, securityText } = authConfig;
  const router = useRouter();

  const [form, setForm] = useState<SignupFormData>({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    agreeToTerms: false,
  });

  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string | null;
    email?: string | null;
    password?: string | null;
    confirmPassword?: string | null;
    agreeToTerms?: string | null;
  }>({});

  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function updateField<K extends keyof SignupFormData>(
    key: K,
    value: SignupFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: null }));
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const nameResult = validateFullName(form.fullName);
    const emailResult = validateEmail(form.email);
    const passwordResult = validatePassword(form.password);

    let confirmPasswordError: string | null = null;
    if (!form.confirmPassword) {
      confirmPasswordError = errors.confirmPasswordRequired;
    } else if (form.confirmPassword !== form.password) {
      confirmPasswordError = errors.confirmPasswordMismatch;
    }

    const agreeError = !form.agreeToTerms
      ? errors.agreeToTermsRequired
      : null;

    const newErrors = {
      fullName: nameResult.error,
      email: emailResult.error,
      password: passwordResult.error,
      confirmPassword: confirmPasswordError,
      agreeToTerms: agreeError,
    };

    setFieldErrors(newErrors);

    const hasValidationErrors = Object.values(newErrors).some(
      (err) => err !== null
    );
    if (hasValidationErrors) return;

    setIsLoading(true);
    setFormError(null);

    const result = await signUp(form.email, form.password, form.fullName);

    if (result.success) {
      router.push("/login?signup=success");
    } else {
      setFormError(result.error ?? errors.signupFailed);
      setIsLoading(false);
    }
  }

  const hasErrors = Object.values(fieldErrors).some((err) => err !== null);

  return (
    <main className="min-h-screen flex flex-col md:flex-row">
      <div className="hidden md:flex md:w-1/2 relative bg-gray-950 dot-grid flex-col justify-between p-12">
        {/* Top: Logo */}
        <BrandLogo />

        {/* Middle: Headlines */}
        <div>
          <h2 className="text-4xl font-extrabold leading-tight">
            <span className="text-white">{loginPanel.headlines[0]}</span>
            <br />
            <span className="text-white">{loginPanel.headlines[1]}</span>
            <br />
            <span className="text-violet-400">{loginPanel.headlines[2]}</span>
          </h2>
          <p className="mt-4 text-gray-400 text-sm leading-relaxed max-w-md">
            {loginPanel.subtext}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {loginPanel.features.map((f) => (
              <span
                key={f}
                className="border border-gray-700 text-gray-400 text-sm px-3 py-1 rounded-full"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom: Stats */}
        <div>
          <div className="flex items-center gap-8">
            {loginPanel.stats.map((s) => (
              <div key={s.label}>
                <span className="text-white font-bold">{s.value}</span>{" "}
                <span className="text-gray-500 text-xs uppercase tracking-wider">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-gray-600 text-xs">
            {"\u26A1"} {loginPanel.poweredBy}
          </p>
        </div>
      </div>
      <div className="w-full md:w-1/2 bg-gray-900 flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">
            {signup.title}
          </h1>
          <p className="mt-2 text-gray-400">{signup.subtitle}</p>
          <div className="w-12 h-1 bg-violet-500 rounded-full mt-3" />
        </div>

        <div>
          {formError && (
            <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <FormInput
              label={signup.fullNameLabel}
              placeholder={signup.fullNamePlaceholder}
              value={form.fullName}
              onChange={(v) => updateField("fullName", v)}
              error={fieldErrors.fullName}
            />

            <FormInput
              label={signup.emailLabel}
              placeholder={signup.emailPlaceholder}
              type="email"
              value={form.email}
              onChange={(v) => updateField("email", v)}
              error={fieldErrors.email}
            />

            <FormInput
              label={signup.passwordLabel}
              placeholder={signup.passwordPlaceholder}
              type="password"
              value={form.password}
              onChange={(v) => updateField("password", v)}
              error={fieldErrors.password}
            />

            <FormInput
              label={signup.confirmPasswordLabel}
              placeholder={signup.confirmPasswordPlaceholder}
              type="password"
              value={form.confirmPassword}
              onChange={(v) => updateField("confirmPassword", v)}
              error={fieldErrors.confirmPassword}
            />

            <div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.agreeToTerms}
                  onChange={(e) =>
                    updateField("agreeToTerms", e.target.checked)
                  }
                  className="mt-1 w-4 h-4 rounded border-gray-700 bg-gray-800 text-violet-500 focus:ring-2 focus:ring-violet-500/50 focus:ring-offset-0 cursor-pointer transition-colors duration-200"
                />
                <span className="text-sm text-gray-400">
                  {signup.agreeText}{" "}
                  <button
                    type="button"
                    onClick={() => setIsTermsOpen(true)}
                    className={`${INTERACTION_CLASSES.textLink} underline`}
                  >
                    {signup.termsText}
                  </button>{" "}
                  {signup.andText}{" "}
                  <button
                    type="button"
                    onClick={() => setIsPrivacyOpen(true)}
                    className={`${INTERACTION_CLASSES.textLink} underline`}
                  >
                    {signup.privacyText}
                  </button>
                </span>
              </label>
              {fieldErrors.agreeToTerms && (
                <p className="mt-1.5 text-sm text-red-400">
                  {fieldErrors.agreeToTerms}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={hasErrors || isLoading}
              className="w-full bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-bold py-4 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/25 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? loading.creatingAccount : <>{signup.submitButton} {signup.submitArrow}</>}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-400">
          {signup.hasAccountText}{" "}
          <Link
            href={signup.signInHref}
            className="text-violet-400 hover:text-violet-300 hover:underline underline-offset-4 font-medium cursor-pointer transition-colors duration-200"
          >
            {signup.signInText}
          </Link>
        </p>

        <p className="mt-6 text-center text-gray-600 text-xs">
          {securityText}
        </p>
      </div>
      </div>

      <Modal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        title={signup.termsModalTitle}
      >
        <TermsContent />
      </Modal>

      <Modal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
        title={signup.privacyModalTitle}
      >
        <PrivacyContent />
      </Modal>
    </main>
  );
}
