"use client";

import { useState } from "react";

interface ShipmentActionsProps {
  shipmentId: string;
  trackingNumber: string | null;
  labelData: string | null;
  trackingSyncStatus: "NOT_SYNCED" | "SYNCED" | "ERROR";
  status: "PENDING" | "LABELED" | "COMPLETED";
  holdedEmailStatus: "NOT_SENT" | "SENT" | "ERROR";
  recipientEmail: string | null;
  onActionComplete: () => void;
}

export function ShipmentActions({
  shipmentId,
  trackingNumber,
  labelData,
  trackingSyncStatus,
  status,
  holdedEmailStatus,
  recipientEmail,
  onActionComplete,
}: ShipmentActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleAction(
    action: string,
    confirmMessage?: string
  ) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    setLoading(action);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/shipments/${shipmentId}/${action}`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        setError(data.error ?? `Action failed (${res.status})`);
        return;
      }

      // Show success for complete/resend actions
      if (action === "complete") {
        setSuccessMsg("Marked as Completed in Holded and email sent.");
      } else if (action === "resend-email") {
        setSuccessMsg("Email resent successfully.");
      }

      onActionComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(null);
    }
  }

  // Determine "Complete & Email" button state
  const canComplete =
    trackingNumber !== null &&
    trackingSyncStatus === "SYNCED" &&
    status !== "COMPLETED";

  const completeDisabledReason = !trackingNumber
    ? "No tracking number. Generate a label first."
    : trackingSyncStatus !== "SYNCED"
      ? "Tracking not synced to Holded yet."
      : status === "COMPLETED"
        ? "Already completed."
        : !recipientEmail
          ? "Customer email missing."
          : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {/* Label generation */}
        {!trackingNumber && status !== "COMPLETED" && (
          <ActionButton
            label="Generate Label"
            loading={loading === "generate-label"}
            disabled={loading !== null}
            onClick={() => handleAction("generate-label")}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          />
        )}

        {/* Tracking management (only when not completed) */}
        {trackingNumber && status !== "COMPLETED" && (
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

        {/* Download label PDF */}
        {labelData && trackingNumber && (
          <ActionButton
            label="Download Label"
            loading={false}
            disabled={loading !== null}
            onClick={() => {
              const byteCharacters = atob(labelData);
              const bytes = new Uint8Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                bytes[i] = byteCharacters.charCodeAt(i);
              }
              const blob = new Blob([bytes.buffer as ArrayBuffer], {
                type: "application/pdf",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `label-${trackingNumber}.pdf`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="bg-gray-600 hover:bg-gray-700 text-white"
          />
        )}

        {/* Retry sync (only when in error state) */}
        {trackingSyncStatus === "ERROR" && (
          <ActionButton
            label="Retry Sync"
            loading={loading === "retry-sync"}
            disabled={loading !== null}
            onClick={() => handleAction("retry-sync")}
            className="bg-yellow-600 hover:bg-yellow-700 text-white"
          />
        )}

        {/* Complete & Email button */}
        {status !== "COMPLETED" && (
          <span title={completeDisabledReason ?? undefined}>
            <ActionButton
              label="Complete & Email"
              loading={loading === "complete"}
              disabled={loading !== null || !canComplete || !recipientEmail}
              onClick={() =>
                handleAction(
                  "complete",
                  "This will mark the waybill as Completed in Holded and send the customer email. Continue?"
                )
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            />
          </span>
        )}

        {/* Resend email (only when email failed or already sent and user wants resend) */}
        {(holdedEmailStatus === "ERROR" ||
          (status === "COMPLETED" && holdedEmailStatus === "SENT")) && (
          <ActionButton
            label={holdedEmailStatus === "ERROR" ? "Retry Email" : "Resend Email"}
            loading={loading === "resend-email"}
            disabled={loading !== null}
            onClick={() =>
              handleAction(
                "resend-email",
                "This will send the waybill email again. Continue?"
              )
            }
            className={
              holdedEmailStatus === "ERROR"
                ? "bg-yellow-600 hover:bg-yellow-700 text-white"
                : "bg-gray-600 hover:bg-gray-700 text-white"
            }
          />
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
      )}
      {successMsg && (
        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
          {successMsg}
        </p>
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
