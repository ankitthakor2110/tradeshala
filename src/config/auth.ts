export const authConfig = {
  blockedEmailDomains: ["yopmail.com", "mailinator.com", "dispostable.com"],

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
    forgotPasswordHref: "#",
    submitButton: "Sign In",
    noAccountText: "Don't have an account?",
    createAccountText: "Create Account",
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
    hasAccountText: "Already have an account?",
    signInText: "Sign In",
    signInHref: "/login",
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
    genericError: "Something went wrong. Please try again.",
  },

  loading: {
    signingIn: "Signing In...",
    creatingAccount: "Creating Account...",
  },

  success: {
    signupComplete:
      "Account created successfully! Please check your email to verify, then sign in.",
  },
} as const;
