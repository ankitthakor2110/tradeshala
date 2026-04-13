"use client";

import { useState, useEffect } from "react";
import { useIsMounted } from "@/hooks/useIsMounted";
import { getCurrentUser } from "@/services/auth.service";
import { isAdmin } from "@/config/admin";

interface AdminState {
  isAdmin: boolean;
  isLoading: boolean;
  email: string | null;
}

export function useAdmin(): AdminState {
  const mounted = useIsMounted();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    getCurrentUser().then((user) => {
      const userEmail = user?.email ?? null;
      setEmail(userEmail);
      setAdmin(isAdmin(userEmail));
      setLoading(false);
    });
  }, []);

  if (!mounted) {
    return { isAdmin: false, isLoading: true, email: null };
  }

  return { isAdmin: admin, isLoading: loading, email };
}
