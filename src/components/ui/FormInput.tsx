"use client";

interface FormInputProps {
  label: string;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}

export default function FormInput({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  error,
}: FormInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-4 py-3 bg-gray-900 border rounded-lg text-white placeholder-gray-500 outline-none transition-all duration-200 ${
          error
            ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/50"
            : "border-gray-700 focus:border-green-500 focus:ring-2 focus:ring-green-500/50"
        }`}
      />
      {error && <p className="mt-1.5 text-sm text-red-400">{error}</p>}
    </div>
  );
}
