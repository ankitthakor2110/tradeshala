import Link from "next/link";
import type { FooterConfig } from "@/types/landing";

interface FooterProps {
  appName: string;
  footer: FooterConfig;
}

export default function Footer({ footer }: FooterProps) {
  return (
    <footer className="border-t border-gray-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <div className="text-xl font-bold text-violet-400 mb-3">
              <span className="text-white">Trade</span><span className="text-violet-400">Shala</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              {footer.description}
            </p>
          </div>
          {footer.linkGroups.map((group) => (
            <div key={group.title}>
              <h4 className="text-white font-semibold mb-3">{group.title}</h4>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-gray-400 hover:text-violet-400 hover:underline underline-offset-4 text-sm cursor-pointer transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
          {footer.copyright}
        </div>
      </div>
    </footer>
  );
}
