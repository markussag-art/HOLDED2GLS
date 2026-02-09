"use client";

import { useEffect, useState, useCallback } from "react";
import { ShipmentTable } from "@/components/shipment-table";
import { CreateShipmentModal } from "@/components/create-shipment-modal";

interface Shipment {
  id: string;
  createdAt: string;
  updatedAt: string;
  holdedDocType: string;
  holdedDocumentId: string;
  holdedDocNumber: string | null;
  carrier: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelData: string | null;
  labelObsolete: boolean;
  trackingSyncedAt: string | null;
  trackingSyncStatus: "NOT_SYNCED" | "SYNCED" | "ERROR";
  trackingSyncError: string | null;
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

export default function Home() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const fetchShipments = useCallback(async () => {
    try {
      const res = await fetch("/api/shipments");
      if (res.ok) {
        setShipments(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  async function handleSyncPending() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/shipments/sync-pending", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const parts = [];
        parts.push(`${data.imported} imported`);
        parts.push(`${data.skipped} skipped`);
        parts.push(`${data.total} total in Holded`);
        if (data.errors?.length > 0) {
          parts.push(`${data.errors.length} errors`);
        }
        setSyncMsg(parts.join(", "));
        fetchShipments();
      } else {
        setSyncMsg(`Error: ${data.error}`);
      }
    } catch (err) {
      setSyncMsg(`Network error: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setSyncing(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === shipments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(shipments.map((s) => s.id)));
    }
  }

  async function handleBulkDownload() {
    if (selectedIds.size === 0) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/shipments/bulk-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Failed to download labels");
        return;
      }

      // Download each label as a separate PDF
      for (const label of data.labels) {
        const blob = base64ToBlob(label.labelData, "application/pdf");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `label-${label.trackingNumber ?? label.reference}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert(`Download error: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setDownloading(false);
    }
  }

  const labeledSelected = shipments.filter(
    (s) => selectedIds.has(s.id) && s.labelData
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Shipments</h1>
        <div className="flex gap-2">
          <button
            onClick={handleSyncPending}
            disabled={syncing}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync Pending"}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            + New Shipment
          </button>
        </div>
      </div>

      {syncMsg && (
        <div
          className={`mb-4 px-4 py-2 rounded-lg text-sm ${
            syncMsg.startsWith("Error")
              ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
              : "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
          }`}
        >
          {syncMsg}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <span className="text-sm text-blue-700 dark:text-blue-300">
            {selectedIds.size} selected
          </span>
          <button
            onClick={handleBulkDownload}
            disabled={downloading || labeledSelected === 0}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {downloading
              ? "Downloading..."
              : `Download ${labeledSelected} Label${labeledSelected !== 1 ? "s" : ""}`}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Clear
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : shipments.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No shipments yet</p>
          <p className="text-sm">
            Click &quot;Sync Pending&quot; to import waybills from Holded, or
            create a shipment manually.
          </p>
        </div>
      ) : (
        <ShipmentTable
          shipments={shipments}
          onRefresh={fetchShipments}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      )}

      {showCreate && (
        <CreateShipmentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchShipments();
          }}
        />
      )}
    </div>
  );
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const bytes = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    bytes[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
}
