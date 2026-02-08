"use client";

type SyncStatus = "NOT_SYNCED" | "SYNCED" | "ERROR";

interface SyncStatusBadgeProps {
  status: SyncStatus;
  error?: string | null;
}

const statusConfig: Record<
  SyncStatus,
  { label: string; className: string; icon: string }
> = {
  SYNCED: {
    label: "Synced",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    icon: "\u2705",
  },
  ERROR: {
    label: "Error",
    className:
      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    icon: "\u26A0\uFE0F",
  },
  NOT_SYNCED: {
    label: "Pending",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    icon: "\u23F3",
  },
};

export function SyncStatusBadge({ status, error }: SyncStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.className}`}
      title={error ?? undefined}
    >
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}
