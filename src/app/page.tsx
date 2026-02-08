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
  carrier: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelData: string | null;
  labelObsolete: boolean;
  trackingSyncedAt: string | null;
  trackingSyncStatus: "NOT_SYNCED" | "SYNCED" | "ERROR";
  trackingSyncError: string | null;
  recipientName: string | null;
  reference: string | null;
}

export default function Home() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Shipments</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          + New Shipment
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : shipments.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No shipments yet</p>
          <p className="text-sm">Create a shipment to get started.</p>
        </div>
      ) : (
        <ShipmentTable shipments={shipments} onRefresh={fetchShipments} />
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
