export const authConfig = {
  blockedEmailDomains: ["yopmail.com", "mailinator.com", "dispostable.com"],

  loginPanel: {
    brandLabel: "TradeShala",
    proBadge: "PRO",
    headlines: ["Track Markets.", "Trade Smarter.", "Win Consistently."],
    subtext:
      "India's most powerful paper trading platform. Practice with virtual funds, master strategies, and build confidence before entering real markets.",
    features: ["+ Live Option Chain", "+ Paper Trading", "+ P&L Analytics"],
    stats: [
      { value: "50K+", label: "TRADERS" },
      { value: "99%", label: "UPTIME" },
      { value: "\u20B90", label: "HIDDEN FEES" },
    ],
    poweredBy: "Powered by TradeShala",
  },

  tabs: {
    loginLabel: "Login",
    signUpLabel: "Sign Up",
  },

  login: {
    title: "Welcome Back",
    subtitle: "Sign in to your TradeShala account",
    emailLabel: "Email Address",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter your password",
    rememberMeLabel: "Remember me",
    forgotPasswordText: "Forgot Password?",
    forgotPasswordHref: "/forgot-password",
    submitButton: "Sign In",
    submitArrow: "\u2192",
    noAccountText: "Don't have an account?",
    createAccountText: "Create one free \u2192",
    createAccountHref: "/signup",
  },

  signup: {
    title: "Create Your Account",
    subtitle: "Start your trading journey with TradeShala",
    fullNameLabel: "Full Name",
    fullNamePlaceholder: "Ankit Sharma",
    emailLabel: "Email Address",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    passwordPlaceholder: "Create a strong password",
    confirmPasswordLabel: "Confirm Password",
    confirmPasswordPlaceholder: "Re-enter your password",
    agreeText: "I agree to the",
    termsText: "Terms & Conditions",
    termsModalTitle: "Terms & Conditions",
    andText: "and",
    privacyText: "Privacy Policy",
    privacyModalTitle: "Privacy Policy",
    submitButton: "Create Account",
    submitArrow: "\u2192",
    hasAccountText: "Already have an account?",
    signInText: "Sign in \u2192",
    signInHref: "/login",
  },

  forgotPassword: {
    title: "Forgot Password",
    subtitle: "Enter your email and we'll send you a reset link",
    emailLabel: "Email Address",
    emailPlaceholder: "you@example.com",
    submitButton: "Send Reset Link",
    submitArrow: "\u2192",
    sendingButton: "Sending...",
    backToLogin: "\u2190 Back to Login",
    backToLoginHref: "/login",
    successMessage:
      "Check your email! We sent a password reset link to",
  },

  resetPassword: {
    title: "Reset Password",
    subtitle: "Enter your new password below",
    passwordLabel: "New Password",
    passwordPlaceholder: "Enter new password",
    confirmPasswordLabel: "Confirm New Password",
    confirmPasswordPlaceholder: "Re-enter new password",
    submitButton: "Update Password",
    updatingButton: "Updating...",
    successMessage: "Password updated! Redirecting to login...",
    strengthLabels: {
      weak: "Weak",
      medium: "Medium",
      strong: "Strong",
    },
  },

  errors: {
    emailRequired: "Email is required.",
    emailInvalid: "Please enter a valid email address.",
    emailBlocked: "Please use a permanent email address.",
    passwordRequired: "Password is required.",
    passwordMinLength: "Password must be at least 8 characters.",
    passwordUppercase: "Password must contain at least one uppercase letter.",
    passwordNumber: "Password must contain at least one number.",
    passwordSpecialChar:
      "Password must contain at least one special character.",
    fullNameRequired: "Full name is required.",
    fullNameMinLength: "Full name must be at least 2 characters.",
    fullNameInvalid: "Full name can only contain letters and spaces.",
    confirmPasswordRequired: "Please confirm your password.",
    confirmPasswordMismatch: "Passwords do not match.",
    agreeToTermsRequired: "You must agree to the Terms & Conditions.",
    loginFailed: "Invalid email or password. Please try again.",
    signupFailed: "Could not create account. Please try again.",
    resetEmailFailed: "Could not send reset email. Please try again.",
    resetPasswordFailed: "Could not update password. Please try again.",
    genericError: "Something went wrong. Please try again.",
  },

  loading: {
    signingIn: "Signing In...",
    creatingAccount: "Creating Account...",
  },

  securityText: "\uD83D\uDD12 256-bit SSL encrypted \u00B7 Your data is safe",

  success: {
    signupComplete:
      "Account created successfully! Please check your email to verify, then sign in.",
  },
} as const;
