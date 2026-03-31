"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import FormInput from "@/components/ui/FormInput";
import { authConfig } from "@/config/auth";
import { validateEmail } from "@/utils/validation";
import { signIn } from "@/services/auth.service";
import type { LoginFormData } from "@/types/auth";

export default function LoginForm() {
  const { tabs, login, errors, loading, success } = authConfig;
  const router = useRouter();
  const searchParams = useSearchParams();
  const signupSuccess = searchParams.get("signup") === "success";

  const [form, setForm] = useState<LoginFormData>({
    email: "",
    password: "",
    rememberMe: false,
  });

  const [fieldErrors, setFieldErrors] = useState<{
    email?: string | null;
    password?: string | null;
  }>({});

  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function updateField<K extends keyof LoginFormData>(
    key: K,
    value: LoginFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: null }));
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const emailResult = validateEmail(form.email);
    const passwordResult = form.password
      ? { isValid: true, error: null }
      : { isValid: false, error: errors.passwordRequired };

    const newErrors = {
      email: emailResult.error,
      password: passwordResult.error,
    };

    setFieldErrors(newErrors);

    if (!emailResult.isValid || !passwordResult.isValid) return;

    setIsLoading(true);
    setFormError(null);

    const result = await signIn(form.email, form.password);

    if (result.success) {
      router.push("/dashboard");
    } else {
      setFormError(result.error ?? errors.loginFailed);
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="text-2xl font-bold text-white">
              Trade<span className="text-green-400">Shala</span>
            </span>
          </Link>
          <h1 className="mt-6 text-3xl font-bold text-white">{login.title}</h1>
          <p className="mt-2 text-gray-400">{login.subtitle}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          {/* Tabs */}
          <div className="flex mb-6 bg-gray-800 rounded-lg p-1">
            <button
              type="button"
              className="flex-1 py-2.5 text-sm font-semibold rounded-md bg-green-500 text-white cursor-pointer transition-all duration-200"
            >
              {tabs.loginLabel}
            </button>
            <button
              type="button"
              onClick={() => router.push(login.createAccountHref)}
              className="flex-1 py-2.5 text-sm font-semibold rounded-md text-gray-400 hover:text-white hover:bg-gray-700/50 cursor-pointer transition-all duration-200 active:scale-95"
            >
              {tabs.signUpLabel}
            </button>
          </div>

          {signupSuccess && (
            <div className="mb-5 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400">
              {success.signupComplete}
            </div>
          )}

          {formError && (
            <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <FormInput
              label={login.emailLabel}
              placeholder={login.emailPlaceholder}
              type="email"
              value={form.email}
              onChange={(v) => updateField("email", v)}
              error={fieldErrors.email}
            />

            <FormInput
              label={login.passwordLabel}
              placeholder={login.passwordPlaceholder}
              type="password"
              value={form.password}
              onChange={(v) => updateField("password", v)}
              error={fieldErrors.password}
            />

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.rememberMe}
                  onChange={(e) => updateField("rememberMe", e.target.checked)}
                  className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-green-500 focus:ring-2 focus:ring-green-500/50 focus:ring-offset-0 cursor-pointer transition-colors duration-200"
                />
                <span className="text-sm text-gray-400">
                  {login.rememberMeLabel}
                </span>
              </label>
              <Link
                href={login.forgotPasswordHref}
                className="text-sm text-green-400 hover:text-green-300 hover:underline underline-offset-4 cursor-pointer transition-colors duration-200"
              >
                {login.forgotPasswordText}
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-green-500 hover:bg-green-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none text-white py-3 rounded-lg font-semibold cursor-pointer transition-all duration-200 active:scale-95"
            >
              {isLoading ? loading.signingIn : login.submitButton}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-400">
          {login.noAccountText}{" "}
          <Link
            href={login.createAccountHref}
            className="text-green-400 hover:text-green-300 hover:underline underline-offset-4 font-medium cursor-pointer transition-colors duration-200"
          >
            {login.createAccountText}
          </Link>
        </p>
      </div>
    </main>
  );
}
