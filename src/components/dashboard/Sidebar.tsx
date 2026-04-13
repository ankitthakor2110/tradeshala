"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardConfig } from "@/config/dashboard";
import BrandLogo from "@/components/ui/BrandLogo";
import SidebarIcon from "./SidebarIcon";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { sidebar } = dashboardConfig;

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-40 h-screen w-[220px] bg-gray-900 border-r border-gray-800 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div
          onClick={onClose}
          className="h-16 flex items-center px-4 border-b border-gray-800 shrink-0"
        >
          <BrandLogo />
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-1 py-4 px-3 overflow-y-auto">
          {sidebar.items.filter((item) => item.visible !== false).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
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
            onClick={onClose}
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
      </aside>
    </>
  );
}
