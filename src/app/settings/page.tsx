"use client";

import { useState, useEffect } from "react";
import AppShell from "@/components/AppShell";

interface SettingsData {
  holdedApiKey: string;
  holdedDocType: string;
  glsUsername: string;
  glsPassword: string;
  glsContactId: string;
  glsBaseUrl: string;
  glsDefaultService: string;
  senderName: string;
  senderCif: string;
  senderAddress: string;
  senderCity: string;
  senderProvince: string;
  senderPostalCode: string;
  senderCountry: string;
  senderCountryCode: string;
  senderPhone: string;
  senderEmail: string;
  autoSyncEnabled: boolean;
  autoSyncMinutes: number;
}

const DOC_TYPES = [
  { value: "waybill", label: "Waybill / Delivery Note (albaran)" },
  { value: "salesorder", label: "Sales Order" },
  { value: "invoice", label: "Invoice" },
  { value: "proform", label: "Proforma" },
];

const GLS_SERVICES = [
  { code: "BusinessParcel", name: "Business Parcel (24-48h)" },
  { code: "EconomyParcel", name: "Economy Parcel (48-72h)" },
  { code: "EuroBusinessParcel", name: "Euro Business Parcel (International)" },
  { code: "service_guaranteed24", name: "Guaranteed 24h" },
  { code: "service_1000", name: "Before 10:30" },
  { code: "service_1200", name: "Before 14:00" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        setSettings(await res.json());
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSettings(await res.json());
        setMessage({ type: "success", text: "Settings saved successfully." });
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Failed to save." });
      }
    } catch (err) {
      setMessage({ type: "error", text: `Error: ${err instanceof Error ? err.message : String(err)}` });
    }
    setSaving(false);
  }

  function updateField(field: keyof SettingsData, value: string | boolean | number) {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </AppShell>
    );
  }

  if (!settings) {
    return (
      <AppShell>
        <div className="text-center py-12 text-gray-500">Failed to load settings.</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500">Configure API keys, sender details, and defaults</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>

        {message && (
          <div
            className={`p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Holded API */}
        <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Holded ERP</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input
                type="password"
                value={settings.holdedApiKey}
                onChange={(e) => updateField("holdedApiKey", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter Holded API key"
              />
              <p className="text-xs text-gray-400 mt-1">Encrypted at rest. From Holded Settings &gt; API.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
              <select
                value={settings.holdedDocType}
                onChange={(e) => updateField("holdedDocType", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500"
              >
                {DOC_TYPES.map((dt) => (
                  <option key={dt.value} value={dt.value}>
                    {dt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Which document type to sync from Holded.</p>
            </div>
          </div>
        </section>

        {/* GLS */}
        <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">GLS Carrier</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={settings.glsUsername}
                onChange={(e) => updateField("glsUsername", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={settings.glsPassword}
                onChange={(e) => updateField("glsPassword", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter GLS password"
              />
              <p className="text-xs text-gray-400 mt-1">Encrypted at rest.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact ID</label>
              <input
                type="text"
                value={settings.glsContactId}
                onChange={(e) => updateField("glsContactId", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">GLS shipper Contact ID (from GLS).</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
              <input
                type="url"
                value={settings.glsBaseUrl}
                onChange={(e) => updateField("glsBaseUrl", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">GLS ShipIT REST endpoint base URL.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Service</label>
              <select
                value={settings.glsDefaultService}
                onChange={(e) => updateField("glsDefaultService", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500"
              >
                {GLS_SERVICES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Sender Details */}
        <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Sender / Shipper Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input
                type="text"
                value={settings.senderName}
                onChange={(e) => updateField("senderName", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CIF/NIF</label>
              <input
                type="text"
                value={settings.senderCif}
                onChange={(e) => updateField("senderCif", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input
                type="text"
                value={settings.senderAddress}
                onChange={(e) => updateField("senderAddress", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={settings.senderCity}
                onChange={(e) => updateField("senderCity", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Province</label>
              <input
                type="text"
                value={settings.senderProvince}
                onChange={(e) => updateField("senderProvince", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
              <input
                type="text"
                value={settings.senderPostalCode}
                onChange={(e) => updateField("senderPostalCode", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country Code</label>
              <input
                type="text"
                value={settings.senderCountryCode}
                onChange={(e) => updateField("senderCountryCode", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                maxLength={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={settings.senderPhone}
                onChange={(e) => updateField("senderPhone", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={settings.senderEmail}
                onChange={(e) => updateField("senderEmail", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </section>

        {/* Auto-sync */}
        <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Auto Sync</h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.autoSyncEnabled}
                onChange={(e) => updateField("autoSyncEnabled", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Enable automatic sync</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Every</span>
              <input
                type="number"
                min={5}
                max={1440}
                value={settings.autoSyncMinutes}
                onChange={(e) => updateField("autoSyncMinutes", parseInt(e.target.value) || 30)}
                className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-sm text-gray-500">minutes</span>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            When enabled, the system will automatically sync pending documents from Holded.
            Manual sync is always available via the Sync button on the Orders page.
          </p>
        </section>

        {/* Save button at bottom */}
        <div className="flex justify-end pb-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
          >
            {saving ? "Saving..." : "Save All Settings"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
