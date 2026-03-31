import Link from "next/link";
import type { HeroConfig } from "@/types/landing";

interface HeroSectionProps {
  hero: HeroConfig;
}

export default function HeroSection({ hero }: HeroSectionProps) {
  return (
    <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-green-500/10 via-transparent to-transparent" />
      <div className="relative max-w-4xl mx-auto text-center">
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
          <span className="text-white">{hero.headline} </span>
          <span className="text-green-400">{hero.highlightedWord}</span>
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
                  ? "bg-green-500 hover:bg-green-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-green-500/25 text-white px-8 py-4 rounded-lg font-semibold text-lg cursor-pointer transition-all duration-200 active:scale-95 shadow-lg shadow-green-500/25"
                  : "border border-green-500 text-green-400 hover:bg-green-500/10 hover:border-green-400 hover:-translate-y-0.5 px-8 py-4 rounded-lg font-semibold text-lg cursor-pointer transition-all duration-200 active:scale-95"
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
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 bg-gray-800/50 px-3 py-1.5 rounded-full"
            >
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
              {badge.text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
