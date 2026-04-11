"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useIsMounted } from "@/hooks/useIsMounted";

export function useAuthRedirect() {
  const mounted = useIsMounted();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
  }, []);

  return {
    mounted,
    isLoggedIn,
    homeUrl: isLoggedIn ? "/dashboard" : "/",
  };
}
