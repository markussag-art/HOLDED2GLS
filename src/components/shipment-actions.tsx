"use client";

import { useState } from "react";

interface ShipmentActionsProps {
  shipmentId: string;
  trackingNumber: string | null;
  trackingSyncStatus: "NOT_SYNCED" | "SYNCED" | "ERROR";
  onActionComplete: () => void;
}

export function ShipmentActions({
  shipmentId,
  trackingNumber,
  trackingSyncStatus,
  onActionComplete,
}: ShipmentActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(
    action: string,
    confirmMessage?: string
  ) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    setLoading(action);
    setError(null);

    try {
      const res = await fetch(`/api/shipments/${shipmentId}/${action}`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        setError(data.error ?? `Action failed (${res.status})`);
        return;
      }

      onActionComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {!trackingNumber && (
          <ActionButton
            label="Generate Label"
            loading={loading === "generate-label"}
            disabled={loading !== null}
            onClick={() => handleAction("generate-label")}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          />
        )}

        {trackingNumber && (
          <>
            <ActionButton
              label="Delete Tracking"
              loading={loading === "delete-tracking"}
              disabled={loading !== null}
              onClick={() =>
                handleAction(
                  "delete-tracking",
                  "Are you sure you want to delete the tracking number? This will clear it in Holded too."
                )
              }
              className="bg-red-600 hover:bg-red-700 text-white"
            />
            <ActionButton
              label="Regenerate Label"
              loading={loading === "regenerate-label"}
              disabled={loading !== null}
              onClick={() =>
                handleAction(
                  "regenerate-label",
                  "This will create a new tracking number and update Holded. Continue?"
                )
              }
              className="bg-orange-600 hover:bg-orange-700 text-white"
            />
          </>
        )}

        {trackingSyncStatus === "ERROR" && (
          <ActionButton
            label="Retry Sync"
            loading={loading === "retry-sync"}
            disabled={loading !== null}
            onClick={() => handleAction("retry-sync")}
            className="bg-yellow-600 hover:bg-yellow-700 text-white"
          />
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
}

function ActionButton({
  label,
  loading,
  disabled,
  onClick,
  className,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {loading ? "..." : label}
    </button>
  );
}
