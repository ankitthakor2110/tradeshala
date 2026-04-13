"use client";

import Link from "next/link";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import BrandLogo from "@/components/ui/BrandLogo";
import { INTERACTION_CLASSES } from "@/styles/interactions";

export default function NotFound() {
  const { mounted, isLoggedIn, homeUrl } = useAuthRedirect();

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <BrandLogo />
        </div>
        <div className="text-7xl font-bold text-violet-400 mb-4">404</div>
        <h1 className="text-2xl font-bold text-white mb-3">Page Not Found</h1>
        <p className="text-gray-400 mb-8">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href={homeUrl}
          className={`${INTERACTION_CLASSES.primaryButton} inline-block text-white px-6 py-3 rounded-lg font-semibold`}
        >
          {isLoggedIn ? "Go to Dashboard" : "Go Home"}
        </Link>
      </div>
    </main>
  );
}
