"use client";

import { useState, useEffect } from "react";
import StatusBadge from "./StatusBadge";

interface Shipment {
  id: string;
  holdedDocNumber: string;
  holdedDocId: string;
  holdedDocType: string;
  holdedStatusRaw: string;
  localStatus: string;
  recipientName: string;
  recipientCompany: string;
  recipientPhone: string;
  recipientEmail: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  postcode: string;
  country: string;
  countryCode: string;
  parcelsCount: number;
  totalWeightKg: number;
  parcelWeights: string;
  carrier: string;
  serviceType: string;
  serviceCode: string;
  trackingNumber: string;
  labelPdfPath: string;
  orderReference: string;
  customerReference: string;
  shippingNotes: string;
  errorMessage: string;
  docTotal: number;
  docCurrency: string;
  labelGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ServiceType {
  code: string;
  name: string;
  description: string;
  international: boolean;
}

interface CarrierInfo {
  name: string;
  services: ServiceType[];
}

interface Props {
  shipmentId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export default function ShipmentDrawer({ shipmentId, onClose, onUpdate }: Props) {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [carriers, setCarriers] = useState<CarrierInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Editable form state
  const [form, setForm] = useState({
    recipientName: "",
    recipientCompany: "",
    recipientPhone: "",
    recipientEmail: "",
    address1: "",
    address2: "",
    city: "",
    province: "",
    postcode: "",
    country: "",
    countryCode: "",
    parcelsCount: 1,
    totalWeightKg: 0,
    serviceType: "BusinessParcel",
    orderReference: "",
    customerReference: "",
    shippingNotes: "",
  });

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [shipRes, carrierRes] = await Promise.all([
          fetch(`/api/shipments/${shipmentId}`),
          fetch("/api/carriers"),
        ]);
        if (shipRes.ok) {
          const data = await shipRes.json();
          setShipment(data);
          setForm({
            recipientName: data.recipientName || "",
            recipientCompany: data.recipientCompany || "",
            recipientPhone: data.recipientPhone || "",
            recipientEmail: data.recipientEmail || "",
            address1: data.address1 || "",
            address2: data.address2 || "",
            city: data.city || "",
            province: data.province || "",
            postcode: data.postcode || "",
            country: data.country || "",
            countryCode: data.countryCode || "",
            parcelsCount: data.parcelsCount || 1,
            totalWeightKg: data.totalWeightKg || 0,
            serviceType: data.serviceType || "BusinessParcel",
            orderReference: data.orderReference || "",
            customerReference: data.customerReference || "",
            shippingNotes: data.shippingNotes || "",
          });
        }
        if (carrierRes.ok) {
          setCarriers(await carrierRes.json());
        }
      } catch (err) {
        setError(`Failed to load: ${err instanceof Error ? err.message : String(err)}`);
      }
      setLoading(false);
    }
    load();
  }, [shipmentId]);

  function updateForm(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/shipments/${shipmentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        setShipment(data);
        setSuccess("Saved successfully");
        onUpdate();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save");
      }
    } catch (err) {
      setError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setSaving(false);
  }

  async function handleGenerateLabel(regenerate = false) {
    setGenerating(true);
    setError("");
    setSuccess("");
    // Save first
    await handleSave();

    try {
      const res = await fetch(`/api/shipments/${shipmentId}/label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      const data = await res.json();
      if (res.ok) {
        setShipment(data.shipment);
        setSuccess(`Label generated! Tracking: ${data.trackingNumber}`);
        onUpdate();
      } else {
        setError(data.error || "Label generation failed");
      }
    } catch (err) {
      setError(`Generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setGenerating(false);
  }

  async function handleCancelLabel() {
    if (!confirm("Cancel this shipping label? The tracking number will be voided.")) return;
    setCancelling(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setShipment(data.shipment);
        setSuccess("Label cancelled. You can now generate a new one.");
        onUpdate();
      } else {
        setError(data.error || "Cancel failed");
      }
    } catch (err) {
      setError(`Cancel failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setCancelling(false);
  }

  const currentServices = carriers.find((c) => c.name === (shipment?.carrier || "GLS"))?.services || [];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute inset-y-0 right-0 w-full max-w-2xl bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">
              {shipment ? `Order ${shipment.holdedDocNumber}` : "Loading..."}
            </h2>
            {shipment && <StatusBadge status={shipment.localStatus} />}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : shipment ? (
            <>
              {/* Notifications */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  {success}
                </div>
              )}

              {/* Tracking info */}
              {shipment.trackingNumber && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-blue-800">Tracking Number</div>
                      <div className="font-mono text-lg text-blue-900">{shipment.trackingNumber}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => window.open(`/api/shipments/${shipment.id}/label`, "_blank")}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
                      >
                        Download PDF
                      </button>
                      <button
                        onClick={() => {
                          const w = window.open(`/api/shipments/${shipment.id}/label`, "_blank");
                          if (w) setTimeout(() => w.print(), 1000);
                        }}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-md transition-colors"
                      >
                        Print
                      </button>
                    </div>
                  </div>
                  {shipment.labelGeneratedAt && (
                    <div className="text-xs text-blue-600 mt-1">
                      Generated: {new Date(shipment.labelGeneratedAt).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {/* Error display */}
              {shipment.errorMessage && shipment.localStatus === "Error" && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="text-sm font-medium text-red-800">Last Error</div>
                  <div className="text-sm text-red-700 mt-1 break-words">{shipment.errorMessage}</div>
                </div>
              )}

              {/* Recipient Info */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  Recipient
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                    <input
                      type="text"
                      value={form.recipientName}
                      onChange={(e) => updateForm("recipientName", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
                    <input
                      type="text"
                      value={form.recipientCompany}
                      onChange={(e) => updateForm("recipientCompany", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                    <input
                      type="text"
                      value={form.recipientPhone}
                      onChange={(e) => updateForm("recipientPhone", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                    <input
                      type="email"
                      value={form.recipientEmail}
                      onChange={(e) => updateForm("recipientEmail", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Address */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  Shipping Address
                </legend>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Street</label>
                  <input
                    type="text"
                    value={form.address1}
                    onChange={(e) => updateForm("address1", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Street 2</label>
                  <input
                    type="text"
                    value={form.address2}
                    onChange={(e) => updateForm("address2", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => updateForm("city", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Province</label>
                    <input
                      type="text"
                      value={form.province}
                      onChange={(e) => updateForm("province", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Postal Code</label>
                    <input
                      type="text"
                      value={form.postcode}
                      onChange={(e) => updateForm("postcode", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Country Code</label>
                    <input
                      type="text"
                      value={form.countryCode}
                      onChange={(e) => updateForm("countryCode", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      maxLength={2}
                    />
                  </div>
                </div>
              </fieldset>

              {/* Shipment Details */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  Shipment Details
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Number of Parcels
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.parcelsCount}
                      onChange={(e) => updateForm("parcelsCount", parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Total Weight (kg)
                    </label>
                    <input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={form.totalWeightKg}
                      onChange={(e) => updateForm("totalWeightKg", parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Service Type
                  </label>
                  <select
                    value={form.serviceType}
                    onChange={(e) => updateForm("serviceType", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    {currentServices.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name} - {s.description}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>

              {/* References */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  References & Notes
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Order Reference
                    </label>
                    <input
                      type="text"
                      value={form.orderReference}
                      onChange={(e) => updateForm("orderReference", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Customer Reference
                    </label>
                    <input
                      type="text"
                      value={form.customerReference}
                      onChange={(e) => updateForm("customerReference", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Shipping Notes
                  </label>
                  <textarea
                    value={form.shippingNotes}
                    onChange={(e) => updateForm("shippingNotes", e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </fieldset>

              {/* Meta info */}
              <div className="text-xs text-gray-400 space-y-1">
                <div>Holded Doc ID: {shipment.holdedDocId}</div>
                <div>Doc Type: {shipment.holdedDocType}</div>
                <div>Total: {shipment.docTotal} {shipment.docCurrency}</div>
                <div>Created: {new Date(shipment.createdAt).toLocaleString()}</div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">Shipment not found</div>
          )}
        </div>

        {/* Footer Actions */}
        {shipment && !loading && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 space-y-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 px-4 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-md transition-colors"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>

              {(shipment.localStatus === "Pending" || shipment.localStatus === "Error") && (
                <button
                  onClick={() => handleGenerateLabel(false)}
                  disabled={generating}
                  className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium rounded-md transition-colors"
                >
                  {generating ? "Generating..." : "Generate GLS Label"}
                </button>
              )}

              {shipment.localStatus === "Labeled" && (
                <>
                  <button
                    onClick={() => handleGenerateLabel(true)}
                    disabled={generating}
                    className="flex-1 py-2 px-4 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white text-sm font-medium rounded-md transition-colors"
                  >
                    {generating ? "Regenerating..." : "Regenerate Label"}
                  </button>
                  <button
                    onClick={handleCancelLabel}
                    disabled={cancelling}
                    className="py-2 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-md transition-colors"
                  >
                    {cancelling ? "Cancelling..." : "Cancel"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
