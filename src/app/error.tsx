"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
            className="bg-green-500 hover:bg-green-400 text-white px-6 py-3 rounded-lg font-semibold cursor-pointer transition-all duration-200 active:scale-95"
          >
            Try Again
          </button>
          <a
            href="/"
            className="border border-gray-700 hover:border-green-500/50 text-gray-300 hover:text-white px-6 py-3 rounded-lg font-semibold transition-all duration-200"
          >
            Go Home
          </a>
        </div>
      </div>
    </main>
  );
}
