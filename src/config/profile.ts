export const profileConfig = {
  pageTitle: "Profile & Settings",

  sections: {
    personalInfo: "Personal Information",
    security: "Security",
    dangerZone: "Danger Zone",
  },

  fields: {
    fullName: {
      label: "Full Name",
      placeholder: "Enter your full name",
    },
    email: {
      label: "Email Address",
      placeholder: "you@example.com",
    },
    phoneNumber: {
      label: "Phone Number",
      placeholder: "+91 XXXXX XXXXX",
      hint: "+91 XXXXX XXXXX",
    },
    currentPassword: {
      label: "Current Password",
      placeholder: "Enter current password",
    },
    newPassword: {
      label: "New Password",
      placeholder: "Enter new password",
    },
    confirmPassword: {
      label: "Confirm New Password",
      placeholder: "Re-enter new password",
    },
    deleteConfirmation: {
      label: "Type DELETE to confirm",
      placeholder: "DELETE",
    },
    deletePassword: {
      label: "Enter your password",
      placeholder: "Enter your password to confirm",
    },
  },

  buttons: {
    saveChanges: "Save Changes",
    saving: "Saving...",
    updatePassword: "Update Password",
    updating: "Updating...",
    deleteAccount: "Delete Account",
    deleting: "Deleting...",
  },

  success: {
    profileUpdated: "Profile updated successfully.",
    passwordUpdated: "Password updated successfully.",
    accountDeleted: "Account deleted. Redirecting...",
  },

  errors: {
    loadFailed: "Failed to load profile. Please try again.",
    updateFailed: "Failed to update profile. Please try again.",
    passwordUpdateFailed: "Failed to update password. Please try again.",
    currentPasswordWrong: "Current password is incorrect.",
    deleteFailed: "Failed to delete account. Please try again.",
    deleteConfirmationInvalid: "Please type DELETE to confirm.",
    deletePasswordRequired: "Password is required to delete your account.",
    phoneInvalid: "Please enter a valid phone number.",
  },

  confirmations: {
    deleteTitle: "Delete Your Account",
    deleteWarning:
      "This action is permanent and cannot be undone. All your data including your portfolio, trades, and watchlist will be permanently deleted.",
    deleteInstruction: 'Type "DELETE" below to confirm account deletion.',
  },
} as const;
