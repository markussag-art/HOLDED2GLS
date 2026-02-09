"use client";

type SyncStatus = "NOT_SYNCED" | "SYNCED" | "ERROR";
type ShipmentStatus = "PENDING" | "LABELED" | "COMPLETED";
type EmailStatus = "NOT_SENT" | "SENT" | "ERROR";

interface SyncStatusBadgeProps {
  status: SyncStatus;
  error?: string | null;
}

const syncStatusConfig: Record<
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
  const config = syncStatusConfig[status];

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

// --- Shipment Status Badge ---

const shipmentStatusConfig: Record<
  ShipmentStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pending",
    className:
      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
  LABELED: {
    label: "Labeled",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  COMPLETED: {
    label: "Completed",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
};

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const config = shipmentStatusConfig[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// --- Email Status Badge ---

const emailStatusConfig: Record<
  EmailStatus,
  { label: string; className: string }
> = {
  NOT_SENT: {
    label: "Not sent",
    className:
      "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
  SENT: {
    label: "Sent",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  ERROR: {
    label: "Email failed",
    className:
      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
};

export function EmailStatusBadge({
  status,
  error,
}: {
  status: EmailStatus;
  error?: string | null;
}) {
  const config = emailStatusConfig[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.className}`}
      title={error ?? undefined}
    >
      {config.label}
    </span>
  );
}
