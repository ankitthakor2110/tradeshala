"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardConfig } from "@/config/dashboard";
import BrandLogo from "@/components/ui/BrandLogo";
import SidebarIcon from "./SidebarIcon";

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { sidebar } = dashboardConfig;

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  function handleNavClick() {
    if (onClose) onClose();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div
        onClick={handleNavClick}
        className="h-16 flex items-center px-4 border-b border-gray-800 shrink-0"
      >
        <BrandLogo />
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 py-4 px-3 overflow-y-auto">
        {sidebar.items
          .filter((item) => item.visible !== false)
          .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNavClick}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                isActive(item.href)
                  ? "bg-violet-500/10 text-violet-400 border-l-2 border-violet-500"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <SidebarIcon name={item.icon} />
              {item.label}
            </Link>
          ))}
      </nav>

      {/* Bottom settings */}
      <div className="border-t border-gray-800 p-3 mt-auto">
        <Link
          href={sidebar.settingsHref}
          onClick={handleNavClick}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
            isActive(sidebar.settingsHref)
              ? "bg-violet-500/10 text-violet-400 border-l-2 border-violet-500"
              : "text-gray-400 hover:bg-gray-800 hover:text-white"
          }`}
        >
          <SidebarIcon name="settings" />
          {sidebar.settingsLabel}
        </Link>
      </div>
    </div>
  );
}
