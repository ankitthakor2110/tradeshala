import type { AdminUser, AdminUserUpdate } from "@/types/admin";

// Client-side readers/mutators for the admin User Management page. Thin fetch
// wrappers over /api/admin/users — all authorization is enforced server-side
// (requireAdmin + service-role client). The browser never touches the
// service-role key or other users' rows directly.

export async function listUsers(): Promise<{
  users: AdminUser[];
  error: string | null;
}> {
  try {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { users: [], error: body?.error ?? "Failed to load users." };
    }
    return { users: body.users ?? [], error: null };
  } catch {
    return { users: [], error: "Something went wrong. Please try again." };
  }
}

export async function updateUser(
  id: string,
  update: AdminUserUpdate
): Promise<{ success: boolean; error: string | null }> {
  try {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...update }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: body?.error ?? "Update failed." };
    }
    return { success: true, error: null };
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
}
