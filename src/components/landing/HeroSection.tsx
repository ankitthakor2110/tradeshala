import Link from "next/link";
import type { HeroConfig } from "@/types/landing";

interface HeroSectionProps {
  hero: HeroConfig;
}

export default function HeroSection({ hero }: HeroSectionProps) {
  return (
    <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-violet-500/10 via-transparent to-transparent" />
      <div className="relative max-w-4xl mx-auto text-center">
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
          <span className="text-white">{hero.headline} </span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-300">{hero.highlightedWord}</span>
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
          {hero.subheadline}
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          {hero.ctaButtons.map((button) => (
            <Link
              key={button.label}
              href={button.href}
              className={
                button.variant === "primary"
                  ? "cursor-pointer bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-bold px-8 py-4 rounded-xl text-lg transition-all duration-200 hover:shadow-2xl hover:shadow-violet-500/30 hover:-translate-y-0.5 active:scale-95"
                  : "cursor-pointer border border-gray-700 hover:border-violet-500/50 text-gray-300 hover:text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all duration-200 hover:bg-gray-800"
              }
            >
              {button.label}
            </Link>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {hero.badges.map((badge) => (
            <span
              key={badge.text}
              className="inline-flex items-center gap-1.5 text-sm bg-violet-500/10 border border-violet-500/20 text-violet-400 px-3 py-1.5 rounded-full"
            >
              <span className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
              {badge.text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
