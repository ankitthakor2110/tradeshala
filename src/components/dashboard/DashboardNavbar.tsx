"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { dashboardConfig } from "@/config/dashboard";
import { getMarketStatus } from "@/services/dashboard.service";
import { signOut, getCurrentUser } from "@/services/auth.service";
import { INTERACTION_CLASSES } from "@/styles/interactions";

interface DashboardNavbarProps {
  onMenuToggle: () => void;
}

export default function DashboardNavbar({
  onMenuToggle,
}: DashboardNavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { navbar } = dashboardConfig;

  const [mounted, setMounted] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [userInitials, setUserInitials] = useState("U");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const pageTitle = navbar.pageTitles[pathname] ?? navbar.defaultTitle;

  useEffect(() => {
    setMounted(true);
    setMarketOpen(getMarketStatus());

    const interval = setInterval(() => {
      setMarketOpen(getMarketStatus());
    }, 60000);

    getCurrentUser().then((user) => {
      if (user) {
        const name =
          (user.user_metadata?.full_name as string) ?? user.email ?? "";
        setUserName(name);
        setUserEmail(user.email ?? "");
        setUserInitials(
          name
            .split(" ")
            .map((w: string) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 2) || "U"
        );
      }
    });

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  if (!mounted) return null;

  return (
    <header className="fixed top-0 right-0 left-0 lg:left-60 z-30 h-16 bg-gray-950/80 backdrop-blur-md border-b border-gray-800 flex items-center px-4 sm:px-6 gap-4">
      {/* Hamburger */}
      <button
        onClick={onMenuToggle}
        className={`${INTERACTION_CLASSES.iconButton} lg:hidden text-gray-400 hover:text-white`}
      >
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* Page title */}
      <h1 className="text-lg font-semibold text-white">{pageTitle}</h1>

      <div className="ml-auto flex items-center gap-4">
        {/* Market status */}
        <div
          className={`hidden sm:flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full ${
            marketOpen
              ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${marketOpen ? "bg-violet-400 animate-pulse" : "bg-red-400"}`}
          />
          {marketOpen ? navbar.marketOpenLabel : navbar.marketClosedLabel}
        </div>

        {/* Notification bell */}
        <button className={`${INTERACTION_CLASSES.iconButton} text-gray-400 hover:text-white relative`}>
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
        </button>

        {/* Profile dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className={`${INTERACTION_CLASSES.iconButton} w-9 h-9 bg-violet-500/20 flex items-center justify-center text-violet-400 text-sm font-semibold hover:bg-violet-500/30`}
          >
            {userInitials}
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-gray-900 border border-gray-800 rounded-xl shadow-xl py-2 animate-[fadeIn_150ms_ease-out]">
              <div className="px-4 py-3 border-b border-gray-800">
                <p className="text-sm font-medium text-white truncate">
                  {userName}
                </p>
                <p className="text-xs text-gray-400 truncate">{userEmail}</p>
              </div>
              <div className="px-4 py-3 border-b border-gray-800 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">
                    {dashboardConfig.labels.virtualCash}
                  </span>
                  <span className="text-white font-medium">
                    {dashboardConfig.currency}10,00,000
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">
                    {dashboardConfig.labels.portfolioValue}
                  </span>
                  <span className="text-white font-medium">
                    {dashboardConfig.currency}0
                  </span>
                </div>
              </div>
              <div className="py-1">
                <button
                  onClick={handleLogout}
                  className={`${INTERACTION_CLASSES.dropdownItem} w-full text-left text-sm text-red-400`}
                >
                  {navbar.profileMenuItems.logout}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
