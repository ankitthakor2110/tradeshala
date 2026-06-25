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

// The only user who manages the Upstox connection (sees the reconnect banner and
// whose token powers the shared live feed). Configurable via env so it isn't
// checked into source and can differ per environment; falls back to the original
// value. Must be NEXT_PUBLIC_ (read on both client banner + server token resolver).
export const UPSTOX_RECONNECT_EMAIL =
  process.env.NEXT_PUBLIC_UPSTOX_RECONNECT_EMAIL ?? "ankitthakor2110@gmail.com";

export const canReconnectUpstox = (email: string | null | undefined): boolean =>
  !!email && email.toLowerCase() === UPSTOX_RECONNECT_EMAIL.toLowerCase();
