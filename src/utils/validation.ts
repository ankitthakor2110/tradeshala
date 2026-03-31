import type { ValidationResult } from "@/types/auth";
import { authConfig } from "@/config/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FULL_NAME_REGEX = /^[a-zA-Z\s]+$/;

export function validateEmail(email: string): ValidationResult {
  if (!email.trim()) {
    return { isValid: false, error: authConfig.errors.emailRequired };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { isValid: false, error: authConfig.errors.emailInvalid };
  }

  const domain = email.split("@")[1]?.toLowerCase();
  if (
    domain &&
    (authConfig.blockedEmailDomains as readonly string[]).includes(domain)
  ) {
    return { isValid: false, error: authConfig.errors.emailBlocked };
  }

  return { isValid: true, error: null };
}

export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { isValid: false, error: authConfig.errors.passwordRequired };
  }

  if (password.length < 8) {
    return { isValid: false, error: authConfig.errors.passwordMinLength };
  }

  if (!/[A-Z]/.test(password)) {
    return { isValid: false, error: authConfig.errors.passwordUppercase };
  }

  if (!/[0-9]/.test(password)) {
    return { isValid: false, error: authConfig.errors.passwordNumber };
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    return { isValid: false, error: authConfig.errors.passwordSpecialChar };
  }

  return { isValid: true, error: null };
}

export function validateFullName(name: string): ValidationResult {
  if (!name.trim()) {
    return { isValid: false, error: authConfig.errors.fullNameRequired };
  }

  if (name.trim().length < 2) {
    return { isValid: false, error: authConfig.errors.fullNameMinLength };
  }

  if (!FULL_NAME_REGEX.test(name.trim())) {
    return { isValid: false, error: authConfig.errors.fullNameInvalid };
  }

  return { isValid: true, error: null };
}
