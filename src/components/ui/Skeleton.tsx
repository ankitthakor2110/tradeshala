interface SkeletonProps {
  className?: string;
  variant?: "text" | "card" | "circle" | "table";
}

const variantStyles: Record<string, string> = {
  text: "h-4 w-full rounded",
  card: "h-32 w-full rounded-2xl",
  circle: "h-10 w-10 rounded-full",
  table: "h-12 w-full rounded-lg",
};

export default function Skeleton({
  className = "",
  variant = "text",
}: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-800 ${variantStyles[variant]} ${className}`}
    />
  );
}
