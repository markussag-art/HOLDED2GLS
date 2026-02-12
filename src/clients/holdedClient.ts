import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

/**
 * Holded API client.
 *
 * Endpoints used:
 *  - GET  /api/invoicing/v1/documents/{docType}/{documentId}        → get document
 *  - PUT  /api/invoicing/v1/documents/{docType}/{documentId}        → update document (custom fields)
 *  - POST /api/invoicing/v1/documents/{docType}/{documentId}/updatetracking → update tracking info
 *  - POST /api/invoicing/v1/documents/{docType}/{documentId}/pipeline/set   → set pipeline stage
 *  - GET  /api/invoicing/v1/documents/{docType}                     → list documents
 */
export class HoldedClient {
  private http: AxiosInstance;

  constructor(apiKey?: string, baseUrl?: string) {
    this.http = axios.create({
      baseURL: baseUrl || config.holded.baseUrl,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'key': apiKey || config.holded.apiKey,
      },
    });
  }

  // ── Documents ──────────────────────────────────────────────────

  async getDocument(docType: string, documentId: string): Promise<HoldedDocument> {
    const url = `/api/invoicing/v1/documents/${docType}/${documentId}`;
    logger.debug(`Holded GET ${url}`);
    const { data } = await this.http.get(url);
    return data;
  }

  async listDocuments(docType: string): Promise<HoldedDocument[]> {
    const url = `/api/invoicing/v1/documents/${docType}`;
    logger.debug(`Holded GET ${url}`);
    const { data } = await this.http.get(url);
    return data;
  }

  async updateDocument(docType: string, documentId: string, body: Record<string, unknown>): Promise<unknown> {
    const url = `/api/invoicing/v1/documents/${docType}/${documentId}`;
    logger.debug(`Holded PUT ${url}`, { body });
    const { data } = await this.http.put(url, body);
    return data;
  }

  // ── Tracking ───────────────────────────────────────────────────

  async updateTracking(docType: string, documentId: string, trackingUrl: string): Promise<unknown> {
    const url = `/api/invoicing/v1/documents/${docType}/${documentId}/updatetracking`;
    logger.debug(`Holded POST ${url}`, { trackingUrl });
    const { data } = await this.http.post(url, { tracking: trackingUrl });
    return data;
  }

  async clearTracking(docType: string, documentId: string): Promise<unknown> {
    const url = `/api/invoicing/v1/documents/${docType}/${documentId}/updatetracking`;
    logger.debug(`Holded POST ${url} (clear)`);
    const { data } = await this.http.post(url, { tracking: '' });
    return data;
  }

  // ── Pipeline / Etapa ───────────────────────────────────────────

  async setPipelineStage(docType: string, documentId: string, stageId: string): Promise<unknown> {
    const url = `/api/invoicing/v1/documents/${docType}/${documentId}/pipeline/set`;
    logger.debug(`Holded POST ${url}`, { stageId });
    const { data } = await this.http.post(url, { stageId });
    return data;
  }

  // ── Custom fields helpers ──────────────────────────────────────

  /**
   * Finds the custom field entry for "Seguimiento de Envio" in a document,
   * updates its value, and persists via PUT.
   *
   * Holded custom fields are returned in the document as an array:
   *   customFields: [{ field: "<fieldId>", value: "..." }, ...]
   *
   * The field metadata (name → id mapping) is available in the document
   * or via the Holded settings. This function fetches the document,
   * locates the field by name, and updates its value.
   *
   * If the field doesn't exist yet on the document, it will be added.
   */
  async updateCustomField(
    docType: string,
    documentId: string,
    fieldName: string,
    fieldValue: string,
  ): Promise<{ fieldId: string | null }> {
    // Fetch current document to discover custom fields schema
    const doc = await this.getDocument(docType, documentId);

    const customFields: HoldedCustomFieldEntry[] = Array.isArray(doc.customFields)
      ? [...doc.customFields]
      : [];

    // Strategy: locate field by matching name from document's custom field metadata.
    // Holded returns custom fields in different shapes depending on API version.
    // We support both formats:
    //   Format A: customFields: [{ field: "id", value: "val" }]
    //   Format B: customFields: [{ id: "id", name: "Name", value: "val" }]

    let fieldId: string | null = null;
    let found = false;

    for (const cf of customFields) {
      const cfName = cf.name || cf.label || '';
      if (cfName === fieldName) {
        cf.value = fieldValue;
        fieldId = cf.field || cf.id || null;
        found = true;
        break;
      }
    }

    // If the field wasn't on this document yet, search the Holded settings
    // for the field definition. Fallback: we'll add by name.
    if (!found) {
      // Try getting field definitions from document metadata
      if (doc.customFieldsDef) {
        for (const def of doc.customFieldsDef) {
          const defName = def.name || def.label || '';
          if (defName === fieldName) {
            fieldId = def.id || def.field || null;
            customFields.push({ field: fieldId || '', value: fieldValue });
            found = true;
            break;
          }
        }
      }

      // Last resort: push with name-based lookup
      if (!found) {
        logger.warn(`Custom field "${fieldName}" not found on document ${documentId}. Adding entry by name.`);
        customFields.push({ field: fieldName, value: fieldValue, name: fieldName });
      }
    }

    // Persist — send only customFields to avoid overwriting other fields
    await this.updateDocument(docType, documentId, { customFields });

    return { fieldId };
  }

  async clearCustomField(docType: string, documentId: string, fieldName: string): Promise<void> {
    await this.updateCustomField(docType, documentId, fieldName, '');
  }
}

// ── Types ──────────────────────────────────────────────────────────

export interface HoldedDocument {
  id: string;
  docNumber?: string;
  status?: string;
  contact?: string;
  contactName?: string;
  contactTradeName?: string;      // "razón social" / commercial name
  shippingAddress?: HoldedAddress;
  billingAddress?: HoldedAddress;
  customFields?: HoldedCustomFieldEntry[];
  customFieldsDef?: HoldedCustomFieldDef[];
  pipeline?: { stageId?: string };
  phone?: string;
  email?: string;
  [key: string]: unknown;
}

export interface HoldedAddress {
  address?: string;
  city?: string;
  postalCode?: string;
  province?: string;
  country?: string;
  countryCode?: string;
}

export interface HoldedCustomFieldEntry {
  field?: string;
  id?: string;
  name?: string;
  label?: string;
  value: string;
}

export interface HoldedCustomFieldDef {
  id?: string;
  field?: string;
  name?: string;
  label?: string;
  type?: string;
}

// Singleton
let instance: HoldedClient | null = null;
export function getHoldedClient(): HoldedClient {
  if (!instance) instance = new HoldedClient();
  return instance;
}

/** For testing — inject a mock or fresh instance */
export function setHoldedClient(client: HoldedClient): void {
  instance = client;
}
