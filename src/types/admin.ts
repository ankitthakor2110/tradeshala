// Row shown on the admin User Management page (/dashboard/users). Combines the
// auth user (email, activation state, sign-in timing) with the profile row
// (name, phone, virtual balance). Assembled server-side via the service-role
// admin client — never fetched directly from the browser.
export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  phone_number: string | null;
  virtual_balance: number;
  // Derived from auth.users.banned_until: false when banned into the future.
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

// Fields an admin may change for a user. All optional — only the keys present
// are applied. `active` toggles the Supabase auth ban; `password` sets a new
// login password.
export interface AdminUserUpdate {
  full_name?: string;
  phone_number?: string;
  password?: string;
  active?: boolean;
}
