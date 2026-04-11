import Link from "next/link";
import type { CTASectionConfig } from "@/types/landing";

interface CTASectionProps {
  cta: CTASectionConfig;
}

export default function CTASection({ cta }: CTASectionProps) {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto text-center bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/20 rounded-2xl p-12">
        <h2 className="text-3xl sm:text-4xl font-bold text-white">
          {cta.headline}
        </h2>
        <p className="mt-4 text-gray-400 max-w-xl mx-auto">
          {cta.subheadline}
        </p>
        <Link
          href={cta.buttonHref}
          className="mt-8 inline-block bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-bold px-8 py-4 rounded-xl text-lg transition-all duration-200 hover:shadow-2xl hover:shadow-violet-500/30 hover:-translate-y-0.5 active:scale-95"
        >
          {cta.buttonText}
        </Link>
      </div>
    </section>
  );
}
