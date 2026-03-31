"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FormInput from "@/components/ui/FormInput";
import Modal from "@/components/ui/Modal";
import TermsContent from "@/components/legal/TermsContent";
import PrivacyContent from "@/components/legal/PrivacyContent";
import { authConfig } from "@/config/auth";
import {
  validateEmail,
  validatePassword,
  validateFullName,
} from "@/utils/validation";
import { signUp } from "@/services/auth.service";
import type { SignupFormData } from "@/types/auth";

export default function SignupPage() {
  const { signup, errors, loading } = authConfig;
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
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="text-2xl font-bold text-white">
              Trade<span className="text-green-400">Shala</span>
            </span>
          </Link>
          <h1 className="mt-6 text-3xl font-bold text-white">
            {signup.title}
          </h1>
          <p className="mt-2 text-gray-400">{signup.subtitle}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
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
                  className="mt-1 w-4 h-4 rounded border-gray-700 bg-gray-800 text-green-500 focus:ring-2 focus:ring-green-500/50 focus:ring-offset-0 cursor-pointer transition-colors duration-200"
                />
                <span className="text-sm text-gray-400">
                  {signup.agreeText}{" "}
                  <button
                    type="button"
                    onClick={() => setIsTermsOpen(true)}
                    className="text-green-400 hover:text-green-300 underline underline-offset-4 cursor-pointer transition-colors duration-200"
                  >
                    {signup.termsText}
                  </button>{" "}
                  {signup.andText}{" "}
                  <button
                    type="button"
                    onClick={() => setIsPrivacyOpen(true)}
                    className="text-green-400 hover:text-green-300 underline underline-offset-4 cursor-pointer transition-colors duration-200"
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
              className="w-full bg-green-500 hover:bg-green-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none text-white py-3 rounded-lg font-semibold cursor-pointer transition-all duration-200 active:scale-95"
            >
              {isLoading ? loading.creatingAccount : signup.submitButton}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-400">
          {signup.hasAccountText}{" "}
          <Link
            href={signup.signInHref}
            className="text-green-400 hover:text-green-300 hover:underline underline-offset-4 font-medium cursor-pointer transition-colors duration-200"
          >
            {signup.signInText}
          </Link>
        </p>
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
