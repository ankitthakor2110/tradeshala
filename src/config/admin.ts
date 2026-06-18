export const ADMIN_CONFIG = {
  adminEmail: process.env.NEXT_PUBLIC_ADMIN_EMAIL,
  restrictedPages: ["/connection-status"],
};

export const isAdmin = (email: string | null | undefined): boolean => {
  if (!email) return false;
  return (
    email.toLowerCase() ===
    process.env.NEXT_PUBLIC_ADMIN_EMAIL?.toLowerCase()
  );
};

// The only user who manages the Upstox connection (sees the reconnect banner).
export const UPSTOX_RECONNECT_EMAIL = "ankitthakor2110@gmail.com";

export const canReconnectUpstox = (email: string | null | undefined): boolean =>
  !!email && email.toLowerCase() === UPSTOX_RECONNECT_EMAIL.toLowerCase();
