"use client";

import {
  SyncStatusBadge,
  ShipmentStatusBadge,
  EmailStatusBadge,
} from "./sync-status-badge";
import { ShipmentActions } from "./shipment-actions";

interface Shipment {
  id: string;
  createdAt: string;
  holdedDocType: string;
  holdedDocumentId: string;
  holdedDocNumber: string | null;
  carrier: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelData: string | null;
  labelObsolete: boolean;
  trackingSyncStatus: "NOT_SYNCED" | "SYNCED" | "ERROR";
  trackingSyncError: string | null;
  trackingSyncedAt: string | null;
  status: "PENDING" | "LABELED" | "COMPLETED";
  holdedEmailStatus: "NOT_SENT" | "SENT" | "ERROR";
  holdedEmailError: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  recipientPostalCode: string | null;
  reference: string | null;
  weight: number | null;
  packages: number | null;
}

interface ShipmentTableProps {
  shipments: Shipment[];
  onRefresh: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}

export function ShipmentTable({
  shipments,
  onRefresh,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: ShipmentTableProps) {
  const allSelected = shipments.length > 0 && selectedIds.size === shipments.length;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr>
            <th className="px-3 py-3 text-left">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="rounded border-gray-300"
              />
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Reference
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Recipient
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Carrier
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Tracking
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Holded Sync
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Email
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-950 dark:divide-gray-800">
          {shipments.map((s) => {
            // Check for missing fields that block label generation
            const missingFields: string[] = [];
            if (!s.recipientName) missingFields.push("name");
            if (!s.recipientPostalCode) missingFields.push("postcode");
            if (!s.recipientPhone) missingFields.push("phone");
            if (!s.weight || s.weight <= 0) missingFields.push("weight");
            if (!s.packages || s.packages < 1) missingFields.push("packages");

            return (
              <tr
                key={s.id}
                className={`hover:bg-gray-50 dark:hover:bg-gray-900 ${
                  selectedIds.has(s.id) ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                }`}
              >
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onChange={() => onToggleSelect(s.id)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="font-medium">
                    {s.reference ?? s.holdedDocNumber ?? s.id.slice(0, 8)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div>{s.recipientName ?? <span className="text-amber-500">No name</span>}</div>
                  {s.recipientEmail && (
                    <div className="text-xs text-gray-400">{s.recipientEmail}</div>
                  )}
                  {s.recipientPhone && (
                    <div className="text-xs text-gray-400">{s.recipientPhone}</div>
                  )}
                  {missingFields.length > 0 && s.status === "PENDING" && (
                    <div className="text-xs text-amber-500 mt-0.5">
                      Missing: {missingFields.join(", ")}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                    {s.carrier}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {s.trackingNumber ? (
                    <div>
                      {s.trackingUrl ? (
                        <a
                          href={s.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {s.trackingNumber}
                        </a>
                      ) : (
                        <span className="font-mono text-xs">
                          {s.trackingNumber}
                        </span>
                      )}
                      {s.labelObsolete && (
                        <span className="ml-1 text-xs text-gray-400">
                          (obsolete)
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <ShipmentStatusBadge status={s.status} />
                </td>
                <td className="px-4 py-3 text-sm">
                  <SyncStatusBadge
                    status={s.trackingSyncStatus}
                    error={s.trackingSyncError}
                  />
                  {s.trackingSyncError && (
                    <p
                      className="text-xs text-red-500 mt-1 max-w-48 truncate"
                      title={s.trackingSyncError}
                    >
                      {s.trackingSyncError}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <EmailStatusBadge
                    status={s.holdedEmailStatus}
                    error={s.holdedEmailError}
                  />
                </td>
                <td className="px-4 py-3 text-sm">
                  <ShipmentActions
                    shipmentId={s.id}
                    trackingNumber={s.trackingNumber}
                    labelData={s.labelData}
                    trackingSyncStatus={s.trackingSyncStatus}
                    status={s.status}
                    holdedEmailStatus={s.holdedEmailStatus}
                    recipientEmail={s.recipientEmail}
                    onActionComplete={onRefresh}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
