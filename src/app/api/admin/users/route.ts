import { requireAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminUser, AdminUserUpdate } from "@/types/admin";
import type { Profile } from "@/types/database";

// Admin User Management API. Every access to the full user list / cross-user
// mutations happens here behind requireAdmin() using the service-role client
// (bypasses RLS) — never from the browser.
export const dynamic = "force-dynamic";

// ~100 years — Supabase's idiomatic "permanent" ban duration.
const BAN_FOREVER = "876000h";

function isActive(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return true;
  const until = new Date(bannedUntil).getTime();
  return Number.isNaN(until) ? true : until <= Date.now();
}

// GET /api/admin/users — list every registered user (auth ⨝ profiles).
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;

  try {
    const admin = createAdminClient();
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();

    // Page through auth users (default page size is 50).
    const authUsers: {
      id: string;
      email?: string;
      created_at: string;
      last_sign_in_at?: string | null;
      banned_until?: string | null;
    }[] = [];
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }
      authUsers.push(...(data.users as unknown as typeof authUsers));
      if (data.users.length < 1000) break;
    }

    // Profile rows keyed by id for the join.
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, full_name, phone_number, virtual_balance");
    const profileById = new Map<string, Partial<Profile>>();
    for (const p of (profiles ?? []) as Partial<Profile>[]) {
      if (p.id) profileById.set(p.id, p);
    }

    const users: AdminUser[] = authUsers
      .map((u) => {
        const p = profileById.get(u.id);
        const email = u.email ?? p?.email ?? "";
        return {
          id: u.id,
          email,
          full_name: p?.full_name ?? "",
          phone_number: p?.phone_number ?? null,
          virtual_balance: p?.virtual_balance ?? 0,
          is_active: isActive(u.banned_until),
          is_admin: !!adminEmail && email.toLowerCase() === adminEmail,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
        };
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    return Response.json({ users });
  } catch (e) {
    return Response.json(
      { error: (e as Error).message ?? "Failed to load users" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/users — update one user. Body: { id, ...AdminUserUpdate }.
export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;

  let body: AdminUserUpdate & { id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, full_name, phone_number, password, active } = body;
  if (!id) {
    return Response.json({ error: "Missing user id" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();

    // Resolve the target's email to protect the sole admin account.
    const { data: target, error: getErr } =
      await admin.auth.admin.getUserById(id);
    if (getErr || !target?.user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    const targetIsAdmin =
      !!adminEmail && target.user.email?.toLowerCase() === adminEmail;

    // Guard: never deactivate the admin (would lock everyone out of this page).
    if (active === false && targetIsAdmin) {
      return Response.json(
        { error: "The admin account cannot be deactivated." },
        { status: 400 }
      );
    }

    // 1. Profile fields (name / phone) via the profiles table.
    const profilePatch: Record<string, unknown> = {};
    if (typeof full_name === "string") profilePatch.full_name = full_name.trim();
    if (typeof phone_number === "string")
      profilePatch.phone_number = phone_number.trim() || null;
    if (Object.keys(profilePatch).length > 0) {
      profilePatch.updated_at = new Date().toISOString();
      const { error } = await admin
        .from("profiles")
        .update(profilePatch as never)
        .eq("id", id);
      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    // 2. Auth-level changes (password / activation) via the admin API.
    const authPatch: { password?: string; ban_duration?: string } = {};
    if (typeof password === "string" && password.length > 0) {
      if (password.length < 6) {
        return Response.json(
          { error: "Password must be at least 6 characters." },
          { status: 400 }
        );
      }
      authPatch.password = password;
    }
    if (typeof active === "boolean") {
      authPatch.ban_duration = active ? "none" : BAN_FOREVER;
    }
    if (Object.keys(authPatch).length > 0) {
      const { error } = await admin.auth.admin.updateUserById(id, authPatch);
      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: (e as Error).message ?? "Update failed" },
      { status: 500 }
    );
  }
}
