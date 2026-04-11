"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import FormInput from "@/components/ui/FormInput";
import BrandLogo from "@/components/ui/BrandLogo";
import { authConfig } from "@/config/auth";
import { validateEmail } from "@/utils/validation";
import { signIn } from "@/services/auth.service";
import type { LoginFormData } from "@/types/auth";

export default function LoginForm() {
  const { login, errors, loading, success, loginPanel, securityText } = authConfig;
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
  const [showPassword, setShowPassword] = useState(false);

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
    <main className="min-h-screen flex flex-col md:flex-row">
      <div className="hidden md:flex md:w-1/2 relative bg-gray-950 dot-grid flex-col justify-between p-12">
        {/* Top: Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center">
            <span className="text-white text-lg">{"\u2197"}</span>
          </div>
          <BrandLogo />
          <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full font-semibold">
            {loginPanel.proBadge}
          </span>
        </div>

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
          <h1 className="text-3xl font-bold text-white">{login.title}</h1>
          <p className="mt-2 text-gray-400">{login.subtitle}</p>
          <div className="w-12 h-1 bg-violet-500 rounded-full mt-3" />
        </div>

        <div>
          {signupSuccess && (
            <div className="mb-5 p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg text-sm text-violet-400">
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
              value={form.password}
              onChange={(v) => updateField("password", v)}
              error={fieldErrors.password}
              showPasswordToggle
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword(!showPassword)}
            />

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.rememberMe}
                  onChange={(e) => updateField("rememberMe", e.target.checked)}
                  className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-violet-500 focus:ring-2 focus:ring-violet-500/50 focus:ring-offset-0 cursor-pointer transition-colors duration-200"
                />
                <span className="text-sm text-gray-400">
                  {login.rememberMeLabel}
                </span>
              </label>
              <Link
                href={login.forgotPasswordHref}
                className="text-sm text-violet-400 hover:text-violet-300 hover:underline underline-offset-4 cursor-pointer transition-colors duration-200"
              >
                {login.forgotPasswordText}
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-bold py-4 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/25 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? loading.signingIn : <>{login.submitButton} {login.submitArrow}</>}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-400">
          {login.noAccountText}{" "}
          <Link
            href={login.createAccountHref}
            className="text-violet-400 hover:text-violet-300 hover:underline underline-offset-4 font-medium cursor-pointer transition-colors duration-200"
          >
            {login.createAccountText}
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
