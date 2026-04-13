"use client";

import Link from "next/link";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";

interface BrandLogoProps {
  className?: string;
}

export default function BrandLogo({ className = "" }: BrandLogoProps) {
  const { homeUrl } = useAuthRedirect();

  return (
    <Link
      href={homeUrl}
      className={`flex items-center cursor-pointer hover:opacity-80 transition-opacity duration-200 ${className}`}
    >
      <span className="text-xl font-bold text-white">Trade</span>
      <span className="text-xl font-bold text-violet-400">Shala</span>
    </Link>
  );
}
