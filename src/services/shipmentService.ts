import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Shipment, SyncStatus } from '../models/shipment';
import * as repo from '../models/shipmentRepository';
import { getHoldedClient } from '../clients/holdedClient';
import { getGlsClient, GlsShipmentRequest } from '../clients/glsClient';
import { buildTrackingUrl, isValidTrackingUrl } from '../utils/tracking';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

const CUSTOM_FIELD_NAME = 'Seguimiento de Envio';
const SENT_STAGE_ID = config.holdedSentStageId;

// Lock set to prevent duplicate label generation
const activeLocks = new Set<string>();

/**
 * Acquire a per-document lock to prevent concurrent label generation.
 */
function acquireLock(holdedDocumentId: string): boolean {
  if (activeLocks.has(holdedDocumentId)) return false;
  activeLocks.add(holdedDocumentId);
  return true;
}

function releaseLock(holdedDocumentId: string): void {
  activeLocks.delete(holdedDocumentId);
}

// ── Label generation pipeline ────────────────────────────────────

export interface LabelGenerationInput {
  holdedDocumentId: string;
  holdedDocType?: string;

  // Sender defaults (from app config or per-call override)
  senderName: string;
  senderAddress: string;
  senderCity: string;
  senderPostcode: string;
  senderCountry: string;
  senderPhone: string;

  // Recipient
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  recipientPostcode: string;
  recipientCountry: string;
  recipientPhone: string;
  recipientEmail: string;

  weight: number;
  packages: number;
  reference: string;
  notes?: string;
}

export interface LabelGenerationResult {
  shipment: Shipment;
  errors: string[];
}

/**
 * Full label generation pipeline:
 *
 *  1) GLS create shipment → trackingNumber (+ expeditionId if PT) → save PDF
 *  2) Build trackingUrl (ES/PT rules) → store locally
 *  3) Update Holded Seguimiento via /updatetracking
 *  4) Update Holded custom field "Seguimiento de Envio" via PUT
 *  5) Set Holded etapa to "🛻 => Enviado por API GLS" (ONLY if 3+4 succeed)
 *  6) Update local status fields
 *
 * If any Holded step fails, the label/tracking artifacts are preserved locally
 * and the error state is stored per step for granular retry.
 */
export async function generateLabel(input: LabelGenerationInput): Promise<LabelGenerationResult> {
  const docType = input.holdedDocType || 'waybill';
  const errors: string[] = [];

  if (!acquireLock(input.holdedDocumentId)) {
    throw new Error(`Label generation already in progress for document ${input.holdedDocumentId}`);
  }

  try {
    // ── Step 1: Create GLS shipment ──────────────────────────
    const glsClient = getGlsClient();

    const glsRequest: GlsShipmentRequest = {
      senderName: input.senderName,
      senderAddress: input.senderAddress,
      senderCity: input.senderCity,
      senderPostcode: input.senderPostcode,
      senderCountry: input.senderCountry,
      senderPhone: input.senderPhone,
      recipientName: input.recipientName,
      recipientAddress: input.recipientAddress,
      recipientCity: input.recipientCity,
      recipientPostcode: input.recipientPostcode,
      recipientCountry: input.recipientCountry,
      recipientPhone: input.recipientPhone,
      recipientEmail: input.recipientEmail,
      weight: input.weight,
      packages: input.packages,
      reference: input.reference,
      notes: input.notes,
    };

    const glsResult = await glsClient.createShipment(glsRequest);
    logger.info('GLS shipment created', {
      trackingNumber: glsResult.trackingNumber,
      expeditionId: glsResult.expeditionId,
    });

    // Save PDF label
    const labelFileName = `${glsResult.trackingNumber}.pdf`;
    const labelDir = config.labels.dir;
    if (!fs.existsSync(labelDir)) {
      fs.mkdirSync(labelDir, { recursive: true });
    }
    const labelPath = path.join(labelDir, labelFileName);
    fs.writeFileSync(labelPath, Buffer.from(glsResult.labelBase64, 'base64'));
    logger.info('Label PDF saved', { labelPath });

    // ── Step 2: Build tracking URL ───────────────────────────
    const trackingUrl = buildTrackingUrl({
      country: input.recipientCountry,
      trackingNumber: glsResult.trackingNumber,
      postcode: input.recipientPostcode,
      expeditionId: glsResult.expeditionId || undefined,
    });

    if (!isValidTrackingUrl(trackingUrl)) {
      throw new Error(
        `Unable to build valid tracking URL for country=${input.recipientCountry}, ` +
        `tracking=${glsResult.trackingNumber}, postcode=${input.recipientPostcode}, ` +
        `expeditionId=${glsResult.expeditionId}`
      );
    }

    // ── Create/update local shipment record ──────────────────
    let shipment = repo.getShipmentByHoldedDocId(input.holdedDocumentId);

    const shipmentData: Partial<Shipment> = {
      holdedDocumentId: input.holdedDocumentId,
      holdedDocType: docType,
      recipientName: input.recipientName,
      recipientAddress: input.recipientAddress,
      recipientCity: input.recipientCity,
      recipientPostcode: input.recipientPostcode,
      recipientCountry: input.recipientCountry,
      recipientPhone: input.recipientPhone,
      recipientEmail: input.recipientEmail,
      trackingNumber: glsResult.trackingNumber,
      expeditionId: glsResult.expeditionId,
      labelPdfPath: labelPath,
      trackingUrl,
      localStatus: 'LABELED',
    };

    if (shipment) {
      shipment = repo.updateShipment(shipment.id, shipmentData)!;
    } else {
      shipment = repo.createShipment({
        ...shipmentData,
        holdedDocumentId: input.holdedDocumentId,
      });
    }

    // ── Step 3: Update Holded Seguimiento ────────────────────
    let trackingSynced = false;
    try {
      const holdedClient = getHoldedClient();
      await holdedClient.updateTracking(docType, input.holdedDocumentId, trackingUrl);
      shipment = repo.updateShipment(shipment.id, {
        holdedTrackingSyncStatus: 'SYNCED',
        holdedTrackingSyncError: null,
      })!;
      trackingSynced = true;
      logger.info('Holded Seguimiento updated', { trackingUrl });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      errors.push(`Holded Seguimiento update failed: ${errMsg}`);
      shipment = repo.updateShipment(shipment.id, {
        holdedTrackingSyncStatus: 'ERROR',
        holdedTrackingSyncError: errMsg,
      })!;
      logger.error('Holded Seguimiento update failed', { error: errMsg });
    }

    // ── Step 4: Update Holded custom field ───────────────────
    let customFieldSynced = false;
    try {
      const holdedClient = getHoldedClient();
      await holdedClient.updateCustomField(docType, input.holdedDocumentId, CUSTOM_FIELD_NAME, trackingUrl);
      shipment = repo.updateShipment(shipment.id, {
        holdedCustomFieldSyncStatus: 'SYNCED',
        holdedCustomFieldSyncError: null,
      })!;
      customFieldSynced = true;
      logger.info('Holded custom field updated', { field: CUSTOM_FIELD_NAME, trackingUrl });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      errors.push(`Holded custom field update failed: ${errMsg}`);
      shipment = repo.updateShipment(shipment.id, {
        holdedCustomFieldSyncStatus: 'ERROR',
        holdedCustomFieldSyncError: errMsg,
      })!;
      logger.error('Holded custom field update failed', { error: errMsg });
    }

    // ── Step 5: Set Holded etapa (ONLY if steps 3+4 succeeded) ──
    if (trackingSynced && customFieldSynced) {
      try {
        const holdedClient = getHoldedClient();
        await holdedClient.setPipelineStage(docType, input.holdedDocumentId, SENT_STAGE_ID);
        shipment = repo.updateShipment(shipment.id, {
          holdedStageSyncStatus: 'SYNCED',
          holdedStageSyncError: null,
          holdedStageIdLastSet: SENT_STAGE_ID,
          localStatus: 'SENT_BY_API',
        })!;
        logger.info('Holded etapa set', { stageId: SENT_STAGE_ID });
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        errors.push(`Holded pipeline stage set failed: ${errMsg}`);
        shipment = repo.updateShipment(shipment.id, {
          holdedStageSyncStatus: 'ERROR',
          holdedStageSyncError: errMsg,
        })!;
        logger.error('Holded pipeline stage set failed', { error: errMsg });
      }
    } else {
      // Don't set etapa if tracking or custom field failed
      shipment = repo.updateShipment(shipment.id, {
        holdedStageSyncStatus: 'NOT_SYNCED',
        holdedStageSyncError: 'Skipped: tracking or custom field sync failed first',
      })!;
    }

    return { shipment, errors };
  } finally {
    releaseLock(input.holdedDocumentId);
  }
}

// ── Retry individual Holded sync steps ───────────────────────────

export async function retryHoldedTrackingSync(shipmentId: string): Promise<Shipment> {
  const shipment = repo.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);
  if (!shipment.trackingUrl) throw new Error('No tracking URL to sync');

  const holdedClient = getHoldedClient();

  try {
    await holdedClient.updateTracking(
      shipment.holdedDocType,
      shipment.holdedDocumentId,
      shipment.trackingUrl,
    );
    return repo.updateShipment(shipmentId, {
      holdedTrackingSyncStatus: 'SYNCED',
      holdedTrackingSyncError: null,
    })!;
  } catch (err: any) {
    repo.updateShipment(shipmentId, {
      holdedTrackingSyncStatus: 'ERROR',
      holdedTrackingSyncError: err?.message || String(err),
    });
    throw err;
  }
}

export async function retryHoldedCustomFieldSync(shipmentId: string): Promise<Shipment> {
  const shipment = repo.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);
  if (!shipment.trackingUrl) throw new Error('No tracking URL to sync');

  const holdedClient = getHoldedClient();

  try {
    await holdedClient.updateCustomField(
      shipment.holdedDocType,
      shipment.holdedDocumentId,
      CUSTOM_FIELD_NAME,
      shipment.trackingUrl,
    );
    return repo.updateShipment(shipmentId, {
      holdedCustomFieldSyncStatus: 'SYNCED',
      holdedCustomFieldSyncError: null,
    })!;
  } catch (err: any) {
    repo.updateShipment(shipmentId, {
      holdedCustomFieldSyncStatus: 'ERROR',
      holdedCustomFieldSyncError: err?.message || String(err),
    });
    throw err;
  }
}

export async function retryHoldedStageSync(shipmentId: string): Promise<Shipment> {
  const shipment = repo.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

  // Stage should only be set if tracking + custom field are synced
  if (shipment.holdedTrackingSyncStatus !== 'SYNCED') {
    throw new Error('Cannot set etapa: Holded Seguimiento not synced. Retry tracking first.');
  }
  if (shipment.holdedCustomFieldSyncStatus !== 'SYNCED') {
    throw new Error('Cannot set etapa: custom field not synced. Retry custom field first.');
  }

  const holdedClient = getHoldedClient();

  try {
    await holdedClient.setPipelineStage(
      shipment.holdedDocType,
      shipment.holdedDocumentId,
      SENT_STAGE_ID,
    );
    return repo.updateShipment(shipmentId, {
      holdedStageSyncStatus: 'SYNCED',
      holdedStageSyncError: null,
      holdedStageIdLastSet: SENT_STAGE_ID,
      localStatus: 'SENT_BY_API',
    })!;
  } catch (err: any) {
    repo.updateShipment(shipmentId, {
      holdedStageSyncStatus: 'ERROR',
      holdedStageSyncError: err?.message || String(err),
    });
    throw err;
  }
}

/**
 * Retry all failed Holded sync steps in order.
 * Returns the updated shipment and a list of errors from this attempt.
 */
export async function retryAllHoldedSync(shipmentId: string): Promise<{ shipment: Shipment; errors: string[] }> {
  let shipment = repo.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

  const errors: string[] = [];

  // Step 1: Retry tracking if needed
  if (shipment.holdedTrackingSyncStatus !== 'SYNCED') {
    try {
      shipment = await retryHoldedTrackingSync(shipmentId);
    } catch (err: any) {
      errors.push(`Tracking sync: ${err.message}`);
    }
  }

  // Step 2: Retry custom field if needed
  shipment = repo.getShipmentById(shipmentId)!;
  if (shipment.holdedCustomFieldSyncStatus !== 'SYNCED') {
    try {
      shipment = await retryHoldedCustomFieldSync(shipmentId);
    } catch (err: any) {
      errors.push(`Custom field sync: ${err.message}`);
    }
  }

  // Step 3: Retry stage if needed (only if both above are synced)
  shipment = repo.getShipmentById(shipmentId)!;
  if (shipment.holdedStageSyncStatus !== 'SYNCED') {
    try {
      shipment = await retryHoldedStageSync(shipmentId);
    } catch (err: any) {
      errors.push(`Stage sync: ${err.message}`);
    }
  }

  return { shipment: repo.getShipmentById(shipmentId)!, errors };
}

// ── Delete / cancel tracking ─────────────────────────────────────

/**
 * Delete tracking:
 *  1) Clear Holded Seguimiento
 *  2) Clear custom field "Seguimiento de Envio"
 *  3) Leave etapa untouched (documented choice: the pipeline stage is
 *     informational history; clearing it could lose audit trail)
 *  4) Clear local tracking fields
 */
export async function deleteTracking(shipmentId: string): Promise<Shipment> {
  const shipment = repo.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

  const holdedClient = getHoldedClient();

  // Step 1: Clear Holded Seguimiento
  try {
    await holdedClient.clearTracking(shipment.holdedDocType, shipment.holdedDocumentId);
    logger.info('Holded Seguimiento cleared', { shipmentId });
  } catch (err: any) {
    logger.error('Failed to clear Holded Seguimiento', { error: err.message });
    throw new Error(`Failed to clear Holded Seguimiento: ${err.message}`);
  }

  // Step 2: Clear custom field
  try {
    await holdedClient.clearCustomField(
      shipment.holdedDocType,
      shipment.holdedDocumentId,
      CUSTOM_FIELD_NAME,
    );
    logger.info('Holded custom field cleared', { field: CUSTOM_FIELD_NAME, shipmentId });
  } catch (err: any) {
    logger.error('Failed to clear Holded custom field', { error: err.message });
    throw new Error(`Failed to clear Holded custom field: ${err.message}`);
  }

  // Step 3: Etapa left untouched — documented choice (see docs/INTEGRATIONS.md)

  // Step 4: Clear local tracking fields
  return repo.updateShipment(shipmentId, {
    trackingNumber: null,
    expeditionId: null,
    trackingUrl: null,
    labelPdfPath: null,
    holdedTrackingSyncStatus: 'NOT_SYNCED',
    holdedTrackingSyncError: null,
    holdedCustomFieldSyncStatus: 'NOT_SYNCED',
    holdedCustomFieldSyncError: null,
    holdedStageSyncStatus: 'NOT_SYNCED',
    holdedStageSyncError: null,
    holdedStageIdLastSet: null,
    localStatus: 'PENDING',
  })!;
}

// ── Regenerate label ─────────────────────────────────────────────

/**
 * Regenerate label:
 *  1) Clear Holded Seguimiento + custom field
 *  2) Create new GLS shipment → new trackingNumber
 *  3) Build trackingUrl → update Holded Seguimiento → update custom field → set etapa
 *  4) Idempotency via lock prevents double-click duplicates
 */
export async function regenerateLabel(input: LabelGenerationInput): Promise<LabelGenerationResult> {
  const existing = repo.getShipmentByHoldedDocId(input.holdedDocumentId);

  if (existing) {
    const holdedClient = getHoldedClient();
    const docType = existing.holdedDocType;

    // Clear Holded tracking fields first (best-effort)
    try {
      await holdedClient.clearTracking(docType, input.holdedDocumentId);
    } catch (err: any) {
      logger.warn('Failed to clear Holded tracking before regenerate', { error: err.message });
    }

    try {
      await holdedClient.clearCustomField(docType, input.holdedDocumentId, CUSTOM_FIELD_NAME);
    } catch (err: any) {
      logger.warn('Failed to clear Holded custom field before regenerate', { error: err.message });
    }

    // Reset local sync statuses
    repo.updateShipment(existing.id, {
      trackingNumber: null,
      expeditionId: null,
      trackingUrl: null,
      labelPdfPath: null,
      holdedTrackingSyncStatus: 'NOT_SYNCED',
      holdedTrackingSyncError: null,
      holdedCustomFieldSyncStatus: 'NOT_SYNCED',
      holdedCustomFieldSyncError: null,
      holdedStageSyncStatus: 'NOT_SYNCED',
      holdedStageSyncError: null,
      holdedStageIdLastSet: null,
      localStatus: 'PENDING',
    });
  }

  // Run the full label generation pipeline (will create new GLS shipment)
  return generateLabel(input);
}

// ── Sync waybills from Holded ────────────────────────────────────

/**
 * Fetch waybills from Holded that are eligible for processing.
 *
 * Per the new workflow, waybills arrive as "Accepted" by default.
 * We look for documents that:
 *  - Are in Accepted status
 *  - Have NOT been sent by API yet (no etapa "🛻 => Enviado por API GLS")
 *
 * There is NO "Pending → Accepted" transition.
 */
export async function syncWaybillsFromHolded(): Promise<Shipment[]> {
  const holdedClient = getHoldedClient();
  const docs = await holdedClient.listDocuments('waybill');

  const synced: Shipment[] = [];

  for (const doc of docs) {
    // Skip documents that already have the "Sent by API GLS" stage
    if (doc.pipeline?.stageId === SENT_STAGE_ID) continue;

    // Skip documents we've already fully processed
    const existing = repo.getShipmentByHoldedDocId(doc.id);
    if (existing && existing.localStatus === 'SENT_BY_API') continue;

    // Extract shipping address
    const addr = doc.shippingAddress || {};

    const shipmentData: Partial<Shipment> = {
      holdedDocumentId: doc.id,
      holdedDocType: 'waybill',
      recipientName: doc.contactName || '',
      recipientAddress: addr.address || '',
      recipientCity: addr.city || '',
      recipientPostcode: addr.postalCode || '',
      recipientCountry: addr.countryCode || addr.country || '',
      recipientPhone: '',
      recipientEmail: '',
    };

    if (existing) {
      synced.push(repo.updateShipment(existing.id, shipmentData)!);
    } else {
      synced.push(repo.createShipment({
        ...shipmentData,
        holdedDocumentId: doc.id,
      }));
    }
  }

  return synced;
}
