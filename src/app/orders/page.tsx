"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import ShipmentDrawer from "@/components/ShipmentDrawer";

interface Shipment {
  id: string;
  holdedDocNumber: string;
  recipientName: string;
  recipientCompany: string;
  city: string;
  province: string;
  localStatus: string;
  parcelsCount: number;
  totalWeightKg: number;
  carrier: string;
  serviceType: string;
  trackingNumber: string;
  labelPdfPath: string;
  errorMessage: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "Pending", label: "Pending" },
  { value: "Labeled", label: "Labeled" },
  { value: "Shipped", label: "Shipped" },
  { value: "Error", label: "Error" },
];

export default function OrdersPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchShipments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
        status: statusFilter,
        search,
      });
      const res = await fetch(`/api/shipments?${params}`);
      if (res.ok) {
        const data = await res.json();
        setShipments(data.shipments);
        setPagination(data.pagination);
      }
    } catch (err) {
      console.error("Failed to fetch shipments:", err);
    }
    setLoading(false);
  }, [pagination.page, pagination.limit, statusFilter, search]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(
          `Synced: ${data.created} new, ${data.updated} updated, ${data.skipped} skipped` +
          (data.errors?.length ? ` (${data.errors.length} errors)` : "")
        );
        fetchShipments();
      } else {
        setSyncResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setSyncResult(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setSyncing(false);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPagination((p) => ({ ...p, page: 1 }));
  }

  function handleLabelDownload(shipment: Shipment) {
    if (shipment.labelPdfPath) {
      window.open(`/api/shipments/${shipment.id}/label`, "_blank");
    }
  }

  async function handleMarkShipped(shipment: Shipment) {
    const res = await fetch(`/api/shipments/${shipment.id}/ship`, { method: "POST" });
    if (res.ok) fetchShipments();
  }

  return (
    <AppShell>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
            <p className="text-sm text-gray-500">
              Manage shipping documents synced from Holded
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              <svg
                className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {syncing ? "Syncing..." : "Sync Pending"}
            </button>
          </div>
        </div>

        {/* Sync result toast */}
        {syncResult && (
          <div
            className={`p-3 rounded-lg text-sm ${
              syncResult.startsWith("Error") || syncResult.startsWith("Sync failed")
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-green-50 text-green-700 border border-green-200"
            }`}
          >
            {syncResult}
            <button
              onClick={() => setSyncResult(null)}
              className="ml-2 text-gray-400 hover:text-gray-600"
            >
              x
            </button>
          </div>
        )}

        {/* Filters bar */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            {/* Status filter tabs */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => {
                    setStatusFilter(f.value);
                    setPagination((p) => ({ ...p, page: 1 }));
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    statusFilter === f.value
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search doc #, customer, city, tracking..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-md transition-colors"
              >
                Search
              </button>
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSearchInput("");
                    setPagination((p) => ({ ...p, page: 1 }));
                  }}
                  className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm"
                >
                  Clear
                </button>
              )}
            </form>

            {/* Count */}
            <div className="text-sm text-gray-500">
              {pagination.total} order{pagination.total !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doc #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parcels</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weight</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Carrier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tracking</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                        Loading...
                      </div>
                    </td>
                  </tr>
                ) : shipments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      <div className="space-y-2">
                        <svg className="mx-auto h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        <p>No orders found. Click &quot;Sync Pending&quot; to pull from Holded.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  shipments.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedId(s.id)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {s.holdedDocNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div>{s.recipientName}</div>
                        {s.recipientCompany && s.recipientCompany !== s.recipientName && (
                          <div className="text-xs text-gray-400">{s.recipientCompany}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {s.city}
                        {s.province && <span className="text-gray-400"> ({s.province})</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.localStatus} />
                        {s.localStatus === "Error" && s.errorMessage && (
                          <div className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={s.errorMessage}>
                            {s.errorMessage}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{s.parcelsCount}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {s.totalWeightKg > 0 ? `${s.totalWeightKg} kg` : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{s.carrier}</td>
                      <td className="px-4 py-3 text-sm">
                        {s.trackingNumber ? (
                          <span className="font-mono text-xs text-blue-600">{s.trackingNumber}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedId(s.id)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                            title="View / Edit"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          {s.labelPdfPath && (
                            <>
                              <button
                                onClick={() => handleLabelDownload(s)}
                                className="p-1.5 text-gray-400 hover:text-green-600 rounded transition-colors"
                                title="Download Label"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => {
                                  const w = window.open(`/api/shipments/${s.id}/label`, "_blank");
                                  if (w) setTimeout(() => w.print(), 1000);
                                }}
                                className="p-1.5 text-gray-400 hover:text-purple-600 rounded transition-colors"
                                title="Print Label"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                              </button>
                            </>
                          )}
                          {s.localStatus === "Labeled" && (
                            <button
                              onClick={() => handleMarkShipped(s)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                              title="Mark as Shipped"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <div className="text-sm text-gray-500">
                Showing {(pagination.page - 1) * pagination.limit + 1} -{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                {pagination.total}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-100 transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-700">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-100 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Shipment Detail Drawer */}
      {selectedId && (
        <ShipmentDrawer
          shipmentId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdate={fetchShipments}
        />
      )}
    </AppShell>
  );
}
