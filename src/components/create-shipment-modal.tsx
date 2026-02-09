"use client";

import { useState } from "react";

interface CreateShipmentModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateShipmentModal({
  onClose,
  onCreated,
}: CreateShipmentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const body = {
      holdedDocType: formData.get("holdedDocType") as string,
      holdedDocumentId: formData.get("holdedDocumentId") as string,
      carrier: formData.get("carrier") as string,
      recipientName: formData.get("recipientName") as string,
      recipientAddress: formData.get("recipientAddress") as string,
      recipientCity: formData.get("recipientCity") as string,
      recipientPostalCode: formData.get("recipientPostalCode") as string,
      recipientCountry: (formData.get("recipientCountry") as string) || "ES",
      recipientEmail: formData.get("recipientEmail") as string,
      weight: parseFloat(formData.get("weight") as string) || 1,
      packages: parseInt(formData.get("packages") as string) || 1,
      reference: formData.get("reference") as string,
    };

    try {
      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Request failed" }));
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">New Shipment</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            X
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <fieldset className="space-y-4" disabled={loading}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Holded Doc Type
                </label>
                <select
                  name="holdedDocType"
                  required
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-sm"
                >
                  <option value="waybill">Waybill</option>
                  <option value="salesorder">Sales Order</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Holded Document ID
                </label>
                <input
                  name="holdedDocumentId"
                  required
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-sm"
                  placeholder="e.g. 60a1b2c3d4e5f6..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Carrier
                </label>
                <select
                  name="carrier"
                  required
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-sm"
                >
                  <option value="GLS">GLS</option>
                  <option value="MRW">MRW</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Reference
                </label>
                <input
                  name="reference"
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-sm"
                  placeholder="Order ref..."
                />
              </div>
            </div>

            <hr className="border-gray-200 dark:border-gray-700" />
            <p className="text-sm font-medium text-gray-500">
              Recipient details
            </p>

            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                name="recipientName"
                className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-sm"
                placeholder="Recipient name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                name="recipientEmail"
                type="email"
                className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-sm"
                placeholder="customer@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Address</label>
              <input
                name="recipientAddress"
                className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-sm"
                placeholder="Street address"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">City</label>
                <input
                  name="recipientCity"
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Postal Code
                </label>
                <input
                  name="recipientPostalCode"
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Country
                </label>
                <input
                  name="recipientCountry"
                  defaultValue="ES"
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Weight (kg)
                </label>
                <input
                  name="weight"
                  type="number"
                  step="0.1"
                  defaultValue="1"
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Packages
                </label>
                <input
                  name="packages"
                  type="number"
                  defaultValue="1"
                  min="1"
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-sm"
                />
              </div>
            </div>
          </fieldset>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Shipment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
