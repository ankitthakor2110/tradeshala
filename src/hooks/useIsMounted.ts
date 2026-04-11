"use client";

import { useState, useEffect } from "react";

export function useIsMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mounted pattern for hydration safety
    setMounted(true);
  }, []);

  return mounted;
}
