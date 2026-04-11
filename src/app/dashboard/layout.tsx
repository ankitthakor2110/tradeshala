"use client";

import { useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import DashboardNavbar from "@/components/dashboard/DashboardNavbar";
import ToastContainer from "@/components/ui/Toast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <DashboardNavbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
      <main className="lg:ml-60 pt-16 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
      <ToastContainer />
    </div>
  );
}
