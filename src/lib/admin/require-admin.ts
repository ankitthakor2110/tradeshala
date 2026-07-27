import { createClient } from "@/lib/supabase/server";

/**
 * Server-only admin guard for API route handlers.
 *
 * Verifies there is a signed-in user AND that their email matches the server
 * `ADMIN_EMAIL` env (the security boundary — never trust the client-side
 * NEXT_PUBLIC_ADMIN_EMAIL for authorization). Returns the admin email on
 * success, or a ready-to-return Response on failure.
 *
 * Usage:
 *   const gate = await requireAdmin();
 *   if (gate instanceof Response) return gate;
 */
export async function requireAdmin(): Promise<Response | { email: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (
    !adminEmail ||
    user.email?.toLowerCase() !== adminEmail.toLowerCase()
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return { email: user.email! };
}
