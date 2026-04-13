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
