"use client";

import { INTERACTION_CLASSES } from "@/styles/interactions";

interface FormInputProps {
  label: string;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  showPasswordToggle?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
}

export default function FormInput({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  error,
  showPasswordToggle,
  showPassword,
  onTogglePassword,
}: FormInputProps) {
  const inputType = showPasswordToggle
    ? showPassword
      ? "text"
      : "password"
    : type;

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 cursor-text focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all duration-200 ${
            showPasswordToggle ? "pr-12" : ""
          } ${error ? "border-red-500 focus:border-red-500 focus:ring-red-500/50" : ""}`}
        />
        {showPasswordToggle && onTogglePassword && (
          <button
            type="button"
            onClick={onTogglePassword}
            className={`${INTERACTION_CLASSES.iconButton} absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-violet-400`}
          >
            {showPassword ? (
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                />
                <circle cx="12" cy="12" r="3" strokeWidth={2} />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M1 1l22 22"
                />
              </svg>
            )}
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-sm text-red-400">{error}</p>}
    </div>
  );
}
