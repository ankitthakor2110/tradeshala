export interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface SignupFormData {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreeToTerms: boolean;
}

export interface ForgotPasswordFormData {
  email: string;
}

export interface ResetPasswordFormData {
  password: string;
  confirmPassword: string;
}

export interface UpdateProfileData {
  full_name: string;
  phone_number: string;
}

export interface UpdatePasswordData {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export interface DeleteAccountData {
  confirmation_text: string;
  password: string;
}

export type PasswordStrength = "weak" | "medium" | "strong";

export interface ValidationResult {
  isValid: boolean;
  error: string | null;
}
