"use client";

import Link from "next/link";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import { INTERACTION_CLASSES } from "@/styles/interactions";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { isLoggedIn, homeUrl } = useAuthRedirect();

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6 text-red-400">!</div>
        <h1 className="text-2xl font-bold text-white mb-3">
          Something went wrong
        </h1>
        <p className="text-gray-400 mb-8">
          An unexpected error occurred. Please try again or go back to the home
          page.
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className={`${INTERACTION_CLASSES.primaryButton} text-white px-6 py-3 rounded-lg font-semibold`}
          >
            Try Again
          </button>
          <Link
            href={homeUrl}
            className={`${INTERACTION_CLASSES.secondaryButton} text-gray-300 hover:text-white px-6 py-3 rounded-lg font-semibold`}
          >
            {isLoggedIn ? "Go to Dashboard" : "Go Home"}
          </Link>
        </div>
      </div>
    </main>
  );
}
