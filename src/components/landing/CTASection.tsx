import Link from "next/link";
import type { CTASectionConfig } from "@/types/landing";

interface CTASectionProps {
  cta: CTASectionConfig;
}

export default function CTASection({ cta }: CTASectionProps) {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto text-center bg-gradient-to-r from-green-500/10 via-green-500/5 to-green-500/10 border border-green-500/20 rounded-2xl p-12">
        <h2 className="text-3xl sm:text-4xl font-bold text-white">
          {cta.headline}
        </h2>
        <p className="mt-4 text-gray-400 max-w-xl mx-auto">
          {cta.subheadline}
        </p>
        <Link
          href={cta.buttonHref}
          className="mt-8 inline-block bg-green-500 hover:bg-green-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-green-500/25 text-white px-8 py-4 rounded-lg font-semibold text-lg cursor-pointer transition-all duration-200 active:scale-95 shadow-lg shadow-green-500/25"
        >
          {cta.buttonText}
        </Link>
      </div>
    </section>
  );
}
