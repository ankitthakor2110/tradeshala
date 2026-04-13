import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Skip auth middleware if env vars are missing
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const protectedRoutes = [
      "/dashboard",
      "/portfolio",
      "/trades",
      "/watchlist",
    ];

    const isProtected = protectedRoutes.some((route) =>
      request.nextUrl.pathname.startsWith(route)
    );

    if (isProtected && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // Admin-only routes
    const adminOnlyRoutes = ["/connection-status"];
    const isAdminRoute = adminOnlyRoutes.some((route) =>
      request.nextUrl.pathname.startsWith(route)
    );

    if (isAdminRoute) {
      if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
      }

      const userEmail = user.email;
      const adminEmail = process.env.ADMIN_EMAIL;

      if (userEmail !== adminEmail) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        url.searchParams.set("error", "unauthorized");
        return NextResponse.redirect(url);
      }
    }
  } catch {
    // If auth check fails, allow the request through
  }

  return supabaseResponse;
}
