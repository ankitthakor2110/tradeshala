"use client";

import { useState } from "react";
import Link from "next/link";
import FormInput from "@/components/ui/FormInput";
import BrandLogo from "@/components/ui/BrandLogo";
import { authConfig } from "@/config/auth";
import { validateEmail } from "@/utils/validation";
import { sendPasswordReset } from "@/services/auth.service";

export default function ForgotPasswordPage() {
  const { forgotPassword, errors, loginPanel, securityText } = authConfig;

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const result = validateEmail(email);
    setEmailError(result.error);
    if (!result.isValid) return;

    setIsLoading(true);
    setFormError(null);

    const response = await sendPasswordReset(email);

    if (response.success) {
      setSent(true);
    } else {
      setFormError(response.error ?? errors.resetEmailFailed);
    }
    setIsLoading(false);
  }

  return (
    <main className="min-h-screen flex flex-col md:flex-row">
      <div className="hidden md:flex md:w-1/2 relative bg-gray-950 dot-grid flex-col justify-between p-12">
        <BrandLogo />
        <div>
          <h2 className="text-4xl font-extrabold leading-tight">
            <span className="text-white">{loginPanel.headlines[0]}</span><br />
            <span className="text-white">{loginPanel.headlines[1]}</span><br />
            <span className="text-violet-400">{loginPanel.headlines[2]}</span>
          </h2>
          <p className="mt-4 text-gray-400 text-sm leading-relaxed max-w-md">{loginPanel.subtext}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {loginPanel.features.map((f) => (
              <span key={f} className="border border-gray-700 text-gray-400 text-sm px-3 py-1 rounded-full">{f}</span>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-8">
            {loginPanel.stats.map((s) => (
              <div key={s.label}>
                <span className="text-white font-bold">{s.value}</span>{" "}
                <span className="text-gray-500 text-xs uppercase tracking-wider">{s.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-gray-600 text-xs">{"\u26A1"} {loginPanel.poweredBy}</p>
        </div>
      </div>
      <div className="w-full md:w-1/2 bg-gray-900 flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">{forgotPassword.title}</h1>
          <p className="mt-2 text-gray-400">{forgotPassword.subtitle}</p>
          <div className="w-12 h-1 bg-violet-500 rounded-full mt-3" />
        </div>

        <div>
          {sent ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-4 bg-violet-500/10 border border-violet-500/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-violet-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-sm text-violet-400">
                {forgotPassword.successMessage}{" "}
                <span className="font-medium text-white">{email}</span>
              </p>
            </div>
          ) : (
            <>
              {formError && (
                <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                  {formError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <FormInput
                  label={forgotPassword.emailLabel}
                  placeholder={forgotPassword.emailPlaceholder}
                  type="email"
                  value={email}
                  onChange={(v) => {
                    setEmail(v);
                    setEmailError(null);
                    setFormError(null);
                  }}
                  error={emailError}
                />

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-bold py-4 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/25 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading
                    ? forgotPassword.sendingButton
                    : <>{forgotPassword.submitButton} {forgotPassword.submitArrow}</>}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm">
          <Link
            href={forgotPassword.backToLoginHref}
            className="text-violet-400 hover:text-violet-300 hover:underline underline-offset-4 font-medium cursor-pointer transition-colors duration-200"
          >
            {forgotPassword.backToLogin}
          </Link>
        </p>

        <p className="mt-6 text-center text-gray-600 text-xs">
          {securityText}
        </p>
      </div>
      </div>
    </main>
  );
}
