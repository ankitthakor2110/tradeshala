import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Permanently delete the signed-in user's account. The browser SDK can only
// delete the `profiles` row (leaving the auth user able to log back in), so the
// actual deletion runs here via the service-role admin client. Removing the
// auth user cascades to profiles + all user-scoped tables (FK on delete cascade).
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message ?? "Account deletion failed" }, { status: 500 });
  }
}
