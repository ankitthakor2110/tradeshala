import { termsConfig } from "@/config/legal";

export default function TermsContent() {
  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">
        Last updated: {termsConfig.lastUpdated}
      </p>
      {termsConfig.sections.map((section) => (
        <div key={section.title}>
          <h3 className="text-base font-semibold text-green-400 mb-2">
            {section.title}
          </h3>
          <p className="text-sm text-gray-300 leading-relaxed">
            {section.content}
          </p>
        </div>
      ))}
    </div>
  );
}
