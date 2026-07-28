// Copy and labels for the admin User Management page (/dashboard/users).
// Config-driven UI: components render from here, never hardcode strings.
export const usersAdminConfig = {
  title: "User Management",
  subtitle: "View and manage all registered users.",
  adminNote:
    "Admin actions apply immediately. Deactivating a user blocks their login until reactivated.",

  search: {
    placeholder: "Search by name or email…",
  },

  stats: {
    total: "Total Users",
    active: "Active",
    inactive: "Deactivated",
  },

  table: {
    headers: {
      user: "User",
      phone: "Phone",
      balance: "Virtual Cash",
      status: "Status",
      lastSignIn: "Last Sign-in",
      actions: "Actions",
    },
    adminBadge: "Admin",
    active: "Active",
    inactive: "Deactivated",
    neverSignedIn: "Never",
    noResults: "No users match your search.",
    empty: "No registered users yet.",
  },

  actions: {
    edit: "Edit",
    activate: "Activate",
    deactivate: "Deactivate",
  },

  edit: {
    title: "Edit User",
    fullNameLabel: "Full Name",
    fullNamePlaceholder: "Full name",
    phoneLabel: "Phone Number",
    phonePlaceholder: "Phone number",
    passwordLabel: "New Password",
    passwordPlaceholder: "Leave blank to keep current password",
    passwordHint: "Minimum 6 characters. Only set this to force-reset the password.",
    save: "Save Changes",
    saving: "Saving…",
    cancel: "Cancel",
  },

  confirm: {
    cancel: "Cancel",
    saveTitle: "Update this user?",
    saveMessage:
      "Apply your changes to this user's account? A new password, if entered, takes effect immediately.",
    saveConfirm: "Yes, update",
    deactivateTitle: "Deactivate this user?",
    deactivateMessage:
      "They will be blocked from logging in until you reactivate them.",
    deactivateConfirm: "Yes, deactivate",
    activateTitle: "Activate this user?",
    activateMessage: "They will be able to log in again immediately.",
    activateConfirm: "Yes, activate",
  },

  toasts: {
    saved: "User updated.",
    activated: "User activated.",
    deactivated: "User deactivated.",
    loadError: "Could not load users.",
  },

  currency: "₹",
} as const;
