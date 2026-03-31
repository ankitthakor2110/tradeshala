import type { Stat } from "@/types/landing";

interface StatsSectionProps {
  stats: Stat[];
}

export default function StatsSection({ stats }: StatsSectionProps) {
  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 border-y border-gray-800">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="text-3xl sm:text-4xl font-bold text-green-400">
              {stat.value}
            </div>
            <div className="mt-1 text-sm text-gray-400">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
