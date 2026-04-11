import type { Step } from "@/types/landing";

interface HowItWorksSectionProps {
  steps: Step[];
}

export default function HowItWorksSection({ steps }: HowItWorksSectionProps) {
  return (
    <section
      id="how-it-works"
      className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-900/50"
    >
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            Get Started in{" "}
            <span className="text-violet-400">3 Simple Steps</span>
          </h2>
        </div>
        <div className="space-y-8">
          {steps.map((step) => (
            <div key={step.stepNumber} className="flex items-start gap-6">
              <div className="flex-shrink-0 w-12 h-12 bg-violet-500/20 border border-violet-500/30 rounded-full flex items-center justify-center">
                <span className="text-violet-400 font-bold text-lg">
                  {step.stepNumber}
                </span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {step.title}
                </h3>
                <p className="mt-1 text-gray-400">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
