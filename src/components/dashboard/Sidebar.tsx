"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardConfig } from "@/config/dashboard";
import { getCurrentUser } from "@/services/auth.service";
import { getActiveBroker } from "@/services/broker.service";
import BrandLogo from "@/components/ui/BrandLogo";
import SidebarIcon from "./SidebarIcon";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { sidebar } = dashboardConfig;
  const [brokerConnected, setBrokerConnected] = useState(false);

  useEffect(() => {
    getCurrentUser().then(async (user) => {
      if (user) {
        const broker = await getActiveBroker(user.id);
        setBrokerConnected(!!broker);
      }
    });
  }, []);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-60 bg-gray-900 border-r border-gray-800 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-800 shrink-0" onClick={onClose}>
          <BrandLogo />
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {sidebar.items.map((item) => {
            const isActive = pathname === item.href;
            const isBroker = item.href === "/dashboard/broker";
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  isActive
                    ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                <SidebarIcon name={item.icon} />
                {item.label}
                {isBroker && brokerConnected && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom settings */}
        <div className="p-3 border-t border-gray-800">
          <Link
            href={sidebar.settingsHref}
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
              pathname === sidebar.settingsHref
                ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
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
