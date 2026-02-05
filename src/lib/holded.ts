import { decrypt } from "./encryption";

const HOLDED_BASE = "https://api.holded.com/api/invoicing/v1";

export interface HoldedDocument {
  id: string;
  docNumber: string;
  date: number;
  dueDate: number;
  contact: string;
  contactName: string;
  status: number;
  total: number;
  currency: string;
  notes: string;
  desc: string;
  shippingAddress?: string;
  shippingPostalCode?: string;
  shippingCity?: string;
  shippingProvince?: string;
  shippingCountry?: string;
  products?: Array<{
    name: string;
    description: string;
    units: number;
    weight?: number;
    sku?: string;
  }>;
  customFields?: Array<{ field: string; value: string }>;
}

export interface HoldedContact {
  id: string;
  name: string;
  tradeName?: string;
  code?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  type?: string;
  billAddress?: {
    address?: string;
    city?: string;
    postalCode?: number;
    province?: string;
    country?: string;
    countryCode?: string;
  };
  shippingAddresses?: Array<{
    shippingId?: string;
    name?: string;
    address?: string;
    city?: string;
    postalCode?: number;
    province?: string;
    country?: string;
    countryCode?: string;
    notes?: string;
  }>;
}

async function holdedFetch(path: string, apiKeyEncrypted: string) {
  const apiKey = decrypt(apiKeyEncrypted);
  const response = await fetch(`${HOLDED_BASE}${path}`, {
    headers: { key: apiKey, Accept: "application/json" },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Holded API error ${response.status}: ${text}`);
  }
  return response.json();
}

export async function listDocuments(
  apiKeyEncrypted: string,
  docType: string,
  page = 1
): Promise<HoldedDocument[]> {
  return holdedFetch(`/documents/${docType}?page=${page}`, apiKeyEncrypted);
}

export async function getDocument(
  apiKeyEncrypted: string,
  docType: string,
  documentId: string
): Promise<HoldedDocument> {
  return holdedFetch(`/documents/${docType}/${documentId}`, apiKeyEncrypted);
}

export async function getContact(
  apiKeyEncrypted: string,
  contactId: string
): Promise<HoldedContact> {
  const apiKey = decrypt(apiKeyEncrypted);
  const response = await fetch(
    `https://api.holded.com/api/invoicing/v1/contacts/${contactId}`,
    {
      headers: { key: apiKey, Accept: "application/json" },
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Holded Contact API error ${response.status}: ${text}`);
  }
  return response.json();
}

export async function fetchAllPendingDocuments(
  apiKeyEncrypted: string,
  docType: string
): Promise<HoldedDocument[]> {
  const allDocs: HoldedDocument[] = [];
  let page = 1;
  const maxPages = 20; // Safety limit

  while (page <= maxPages) {
    const docs = await listDocuments(apiKeyEncrypted, docType, page);
    if (!Array.isArray(docs) || docs.length === 0) break;
    allDocs.push(...docs);
    if (docs.length < 50) break; // Holded returns up to 50 per page
    page++;
  }

  // Filter for status=1 (pending) or status=0 depending on Holded's convention
  // Status field mapping: we accept all and let the user see them,
  // but we mainly care about unfulfilled/pending ones
  return allDocs;
}
