"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FormInput from "@/components/ui/FormInput";
import BrandLogo from "@/components/ui/BrandLogo";
import { useIsMounted } from "@/hooks/useIsMounted";
import { authConfig } from "@/config/auth";
import { validatePassword } from "@/utils/validation";
import { resetPassword } from "@/services/auth.service";
import type { PasswordStrength } from "@/types/auth";

function getPasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) return "weak";
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (hasSpecial && hasNumber) return "strong";
  return "medium";
}

export default function ResetPasswordPage() {
  const { resetPassword: config, errors } = authConfig;
  const router = useRouter();

  const mounted = useIsMounted();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string | null;
    confirmPassword?: string | null;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const strength: PasswordStrength = password
    ? getPasswordStrength(password)
    : "weak";

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => router.push("/login"), 2000);
      return () => clearTimeout(timer);
    }
  }, [success, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const passwordResult = validatePassword(password);
    let confirmError: string | null = null;
    if (!confirmPassword) {
      confirmError = errors.confirmPasswordRequired;
    } else if (confirmPassword !== password) {
      confirmError = errors.confirmPasswordMismatch;
    }

    setFieldErrors({
      password: passwordResult.error,
      confirmPassword: confirmError,
    });

    if (!passwordResult.isValid || confirmError) return;

    setIsLoading(true);
    setFormError(null);

    const result = await resetPassword(password);

    if (result.success) {
      setSuccess(true);
    } else {
      setFormError(result.error ?? errors.resetPasswordFailed);
    }
    setIsLoading(false);
  }

  if (!mounted) return null;

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

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <BrandLogo className="inline-block" />
          <h1 className="mt-6 text-3xl font-bold text-white">
            {config.title}
          </h1>
          <p className="mt-2 text-gray-400">{config.subtitle}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          {success ? (
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
                {config.successMessage}
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
                <div>
                  <FormInput
                    label={config.passwordLabel}
                    placeholder={config.passwordPlaceholder}
                    value={password}
                    onChange={(v) => {
                      setPassword(v);
                      setFieldErrors((prev) => ({ ...prev, password: null }));
                      setFormError(null);
                    }}
                    error={fieldErrors.password}
                    showPasswordToggle
                    showPassword={showPassword}
                    onTogglePassword={() => setShowPassword(!showPassword)}
                  />
                  {password && (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${strengthColor[strength]} ${strengthWidth[strength]}`}
                        />
                      </div>
                      <p
                        className={`text-xs mt-1 ${strengthTextColor[strength]}`}
                      >
                        {config.strengthLabels[strength]}
                      </p>
                    </div>
                  )}
                </div>

                <FormInput
                  label={config.confirmPasswordLabel}
                  placeholder={config.confirmPasswordPlaceholder}
                  value={confirmPassword}
                  onChange={(v) => {
                    setConfirmPassword(v);
                    setFieldErrors((prev) => ({
                      ...prev,
                      confirmPassword: null,
                    }));
                    setFormError(null);
                  }}
                  error={fieldErrors.confirmPassword}
                  showPasswordToggle
                  showPassword={showConfirmPassword}
                  onTogglePassword={() =>
                    setShowConfirmPassword(!showConfirmPassword)
                  }
                />

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-violet-500 hover:bg-violet-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none text-white py-3 rounded-lg font-semibold cursor-pointer transition-all duration-200 active:scale-95"
                >
                  {isLoading ? config.updatingButton : config.submitButton}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
