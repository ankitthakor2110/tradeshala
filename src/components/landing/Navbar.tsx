"use client";

import Link from "next/link";
import BrandLogo from "@/components/ui/BrandLogo";
import type { NavLink } from "@/types/landing";

interface NavbarProps {
  appName: string;
  links: NavLink[];
}

export default function Navbar({ links }: NavbarProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <BrandLogo />
          <div className="hidden md:flex items-center gap-8">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="relative text-gray-400 hover:text-violet-400 cursor-pointer transition-colors duration-200 text-sm after:absolute after:left-0 after:bottom-[-4px] after:h-[2px] after:w-0 after:bg-violet-400 after:transition-all after:duration-200 hover:after:w-full"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
