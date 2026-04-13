export function timeAgo(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const diff = Date.now() - new Date(dateString).getTime();
  if (diff < 0) return "just now";

  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";

  const mins = Math.floor(secs / 60);
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} mins ago`;

  const hours = Math.floor(mins / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;

  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatOI(value: number): string {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
}
