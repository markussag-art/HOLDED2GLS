import fs from 'fs';
import path from 'path';
import { Shipment, SyncStatus, ShippingMethod } from '../models/shipment';
import * as repo from '../models/shipmentRepository';
import { getHoldedClient } from '../clients/holdedClient';
import { getGlsClient, GlsShipmentRequest, redactGlsResponse } from '../clients/glsClient';
import { buildTrackingUrl, isValidTrackingUrl } from '../utils/tracking';
import { runPreflight, PreflightIssue } from '../utils/preflight';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

const CUSTOM_FIELD_NAME = 'Seguimiento de Envio';
const SENT_STAGE_ID = config.holdedSentStageId;

// Lock set to prevent duplicate label generation
const activeLocks = new Set<string>();

function acquireLock(holdedDocumentId: string): boolean {
  if (activeLocks.has(holdedDocumentId)) return false;
  activeLocks.add(holdedDocumentId);
  return true;
}

function releaseLock(holdedDocumentId: string): void {
  activeLocks.delete(holdedDocumentId);
}

// ── Preflight validation ─────────────────────────────────────────

export function preflightCheck(shipmentId: string): PreflightIssue[] {
  const shipment = repo.getShipmentById(shipmentId);
  if (!shipment) return [{ field: 'id', message: 'Shipment not found' }];
  return runPreflight(shipment);
}

// ── Update shipment params (weight, packages, method, notes) ─────

export function updateShipmentParams(
  shipmentId: string,
  params: {
    weight?: number;
    packages?: number;
    shippingMethod?: ShippingMethod;
    deliveryNotes?: string;
    recipientPhone?: string;
    recipientEmail?: string;
  },
): Shipment {
  const shipment = repo.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);
  return repo.updateShipment(shipmentId, params)!;
}

// ── Label generation pipeline ────────────────────────────────────

export interface LabelGenerationResult {
  shipment: Shipment;
  errors: string[];
}

/**
 * Full label generation pipeline:
 *
 *  0) Preflight validation
 *  1) GLS create shipment → trackingNumber (+ expeditionId if PT) → save PDF
 *  2) Build trackingUrl (ES/PT rules) → store locally
 *  3) Update Holded Seguimiento via /updatetracking
 *  4) Update Holded custom field "Seguimiento de Envio" via PUT
 *  5) Set Holded etapa to "🛻 => Enviado por API GLS" (ONLY if 3+4 succeed)
 *  6) Update local status fields
 */
export async function generateLabel(shipmentId: string): Promise<LabelGenerationResult> {
  const shipment = repo.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

  const docType = shipment.holdedDocType || 'waybill';
  const errors: string[] = [];

  if (!acquireLock(shipment.holdedDocumentId)) {
    throw new Error(`Label generation already in progress for document ${shipment.holdedDocumentId}`);
  }

  try {
    // ── Step 0: Preflight validation ─────────────────────────
    const issues = runPreflight(shipment);
    if (issues.length > 0) {
      throw new Error(
        'Preflight validation failed: ' +
        issues.map(i => `${i.field}: ${i.message}`).join('; '),
      );
    }

    // ── Step 1: Create GLS shipment ──────────────────────────
    const glsClient = getGlsClient();

    // Use commercial name as primary label name, person name as secondary
    const labelName = shipment.recipientCommercialName || shipment.recipientName;
    const contactName = shipment.recipientCommercialName
      ? shipment.recipientName
      : '';

    const glsRequest: GlsShipmentRequest = {
      senderName: config.sender.name,
      senderAddress: config.sender.address,
      senderCity: config.sender.city,
      senderPostcode: config.sender.postcode,
      senderCountry: config.sender.country,
      senderPhone: config.sender.phone,
      senderTaxId: config.sender.taxId,
      recipientName: labelName,
      recipientContactName: contactName,
      recipientAddress: shipment.recipientAddress,
      recipientCity: shipment.recipientCity,
      recipientPostcode: shipment.recipientPostcode,
      recipientCountry: shipment.recipientCountry,
      recipientPhone: shipment.recipientPhone,
      recipientEmail: shipment.recipientEmail,
      weight: shipment.weight,
      packages: shipment.packages,
      shippingMethod: shipment.shippingMethod,
      reference: `Ref. Cli. Albaran ${shipment.waybillNumber || shipment.holdedDocumentId}`,
      notes: shipment.deliveryNotes || undefined,
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
      country: shipment.recipientCountry,
      trackingNumber: glsResult.trackingNumber,
      postcode: shipment.recipientPostcode,
      expeditionId: glsResult.expeditionId || undefined,
    });

    if (!isValidTrackingUrl(trackingUrl)) {
      throw new Error(
        `Unable to build valid tracking URL for country=${shipment.recipientCountry}, ` +
        `tracking=${glsResult.trackingNumber}, postcode=${shipment.recipientPostcode}, ` +
        `expeditionId=${glsResult.expeditionId}`,
      );
    }

    // ── Update local shipment record ─────────────────────────
    let updated = repo.updateShipment(shipmentId, {
      trackingNumber: glsResult.trackingNumber,
      expeditionId: glsResult.expeditionId,
      labelPdfPath: labelPath,
      glsRawResponse: redactGlsResponse(glsResult.rawResponse),
      trackingUrl,
      localStatus: 'LABELED',
    })!;

    // ── Step 3: Update Holded Seguimiento ────────────────────
    let trackingSynced = false;
    try {
      const holdedClient = getHoldedClient();
      await holdedClient.updateTracking(docType, shipment.holdedDocumentId, trackingUrl);
      updated = repo.updateShipment(shipmentId, {
        holdedTrackingSyncStatus: 'SYNCED',
        holdedTrackingSyncError: null,
      })!;
      trackingSynced = true;
      logger.info('Holded Seguimiento updated', { trackingUrl });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      errors.push(`Holded Seguimiento update failed: ${errMsg}`);
      updated = repo.updateShipment(shipmentId, {
        holdedTrackingSyncStatus: 'ERROR',
        holdedTrackingSyncError: errMsg,
      })!;
      logger.error('Holded Seguimiento update failed', { error: errMsg });
    }

    // ── Step 4: Update Holded custom field ───────────────────
    let customFieldSynced = false;
    try {
      const holdedClient = getHoldedClient();
      await holdedClient.updateCustomField(docType, shipment.holdedDocumentId, CUSTOM_FIELD_NAME, trackingUrl);
      updated = repo.updateShipment(shipmentId, {
        holdedCustomFieldSyncStatus: 'SYNCED',
        holdedCustomFieldSyncError: null,
      })!;
      customFieldSynced = true;
      logger.info('Holded custom field updated', { field: CUSTOM_FIELD_NAME, trackingUrl });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      errors.push(`Holded custom field update failed: ${errMsg}`);
      updated = repo.updateShipment(shipmentId, {
        holdedCustomFieldSyncStatus: 'ERROR',
        holdedCustomFieldSyncError: errMsg,
      })!;
      logger.error('Holded custom field update failed', { error: errMsg });
    }

    // ── Step 5: Set Holded etapa (ONLY if steps 3+4 succeeded)
    if (trackingSynced && customFieldSynced) {
      try {
        const holdedClient = getHoldedClient();
        await holdedClient.setPipelineStage(docType, shipment.holdedDocumentId, SENT_STAGE_ID);
        updated = repo.updateShipment(shipmentId, {
          holdedStageSyncStatus: 'SYNCED',
          holdedStageSyncError: null,
          holdedStageIdLastSet: SENT_STAGE_ID,
          localStatus: 'SENT_BY_API',
        })!;
        logger.info('Holded etapa set', { stageId: SENT_STAGE_ID });
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        errors.push(`Holded pipeline stage set failed: ${errMsg}`);
        updated = repo.updateShipment(shipmentId, {
          holdedStageSyncStatus: 'ERROR',
          holdedStageSyncError: errMsg,
        })!;
        logger.error('Holded pipeline stage set failed', { error: errMsg });
      }
    } else {
      updated = repo.updateShipment(shipmentId, {
        holdedStageSyncStatus: 'NOT_SYNCED',
        holdedStageSyncError: 'Skipped: tracking or custom field sync failed first',
      })!;
    }

    return { shipment: repo.getShipmentById(shipmentId)!, errors };
  } finally {
    releaseLock(shipment.holdedDocumentId);
  }
}

// ── Retry individual Holded sync steps ───────────────────────────

export async function retryHoldedTrackingSync(shipmentId: string): Promise<Shipment> {
  const shipment = repo.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);
  if (!shipment.trackingUrl) throw new Error('No tracking URL to sync');

  const holdedClient = getHoldedClient();

  try {
    await holdedClient.updateTracking(shipment.holdedDocType, shipment.holdedDocumentId, shipment.trackingUrl);
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
    await holdedClient.updateCustomField(shipment.holdedDocType, shipment.holdedDocumentId, CUSTOM_FIELD_NAME, shipment.trackingUrl);
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

  if (shipment.holdedTrackingSyncStatus !== 'SYNCED') {
    throw new Error('Cannot set etapa: Holded Seguimiento not synced. Retry tracking first.');
  }
  if (shipment.holdedCustomFieldSyncStatus !== 'SYNCED') {
    throw new Error('Cannot set etapa: custom field not synced. Retry custom field first.');
  }

  const holdedClient = getHoldedClient();

  try {
    await holdedClient.setPipelineStage(shipment.holdedDocType, shipment.holdedDocumentId, SENT_STAGE_ID);
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

export async function retryAllHoldedSync(shipmentId: string): Promise<{ shipment: Shipment; errors: string[] }> {
  let shipment = repo.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

  const errors: string[] = [];

  if (shipment.holdedTrackingSyncStatus !== 'SYNCED') {
    try { shipment = await retryHoldedTrackingSync(shipmentId); }
    catch (err: any) { errors.push(`Tracking sync: ${err.message}`); }
  }

  shipment = repo.getShipmentById(shipmentId)!;
  if (shipment.holdedCustomFieldSyncStatus !== 'SYNCED') {
    try { shipment = await retryHoldedCustomFieldSync(shipmentId); }
    catch (err: any) { errors.push(`Custom field sync: ${err.message}`); }
  }

  shipment = repo.getShipmentById(shipmentId)!;
  if (shipment.holdedStageSyncStatus !== 'SYNCED') {
    try { shipment = await retryHoldedStageSync(shipmentId); }
    catch (err: any) { errors.push(`Stage sync: ${err.message}`); }
  }

  return { shipment: repo.getShipmentById(shipmentId)!, errors };
}

// ── Delete / cancel tracking ─────────────────────────────────────

export async function deleteTracking(shipmentId: string): Promise<Shipment> {
  const shipment = repo.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

  const holdedClient = getHoldedClient();

  try {
    await holdedClient.clearTracking(shipment.holdedDocType, shipment.holdedDocumentId);
    logger.info('Holded Seguimiento cleared', { shipmentId });
  } catch (err: any) {
    throw new Error(`Failed to clear Holded Seguimiento: ${err.message}`);
  }

  try {
    await holdedClient.clearCustomField(shipment.holdedDocType, shipment.holdedDocumentId, CUSTOM_FIELD_NAME);
    logger.info('Holded custom field cleared', { field: CUSTOM_FIELD_NAME, shipmentId });
  } catch (err: any) {
    throw new Error(`Failed to clear Holded custom field: ${err.message}`);
  }

  // Etapa left untouched — documented choice (audit trail)

  return repo.updateShipment(shipmentId, {
    trackingNumber: null,
    expeditionId: null,
    trackingUrl: null,
    labelPdfPath: null,
    glsRawResponse: null,
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

export async function regenerateLabel(shipmentId: string): Promise<LabelGenerationResult> {
  const existing = repo.getShipmentById(shipmentId);
  if (!existing) throw new Error(`Shipment ${shipmentId} not found`);

  const holdedClient = getHoldedClient();

  try { await holdedClient.clearTracking(existing.holdedDocType, existing.holdedDocumentId); }
  catch (err: any) { logger.warn('Failed to clear Holded tracking before regenerate', { error: err.message }); }

  try { await holdedClient.clearCustomField(existing.holdedDocType, existing.holdedDocumentId, CUSTOM_FIELD_NAME); }
  catch (err: any) { logger.warn('Failed to clear Holded custom field before regenerate', { error: err.message }); }

  repo.updateShipment(shipmentId, {
    trackingNumber: null, expeditionId: null, trackingUrl: null,
    labelPdfPath: null, glsRawResponse: null,
    holdedTrackingSyncStatus: 'NOT_SYNCED', holdedTrackingSyncError: null,
    holdedCustomFieldSyncStatus: 'NOT_SYNCED', holdedCustomFieldSyncError: null,
    holdedStageSyncStatus: 'NOT_SYNCED', holdedStageSyncError: null,
    holdedStageIdLastSet: null, localStatus: 'PENDING',
  });

  return generateLabel(shipmentId);
}

// ── Bulk label generation ────────────────────────────────────────

export interface BulkResult {
  shipmentId: string;
  waybillNumber: string;
  success: boolean;
  errors: string[];
}

export async function generateLabelsBulk(shipmentIds: string[]): Promise<BulkResult[]> {
  const results: BulkResult[] = [];

  for (const id of shipmentIds) {
    const shipment = repo.getShipmentById(id);
    const waybillNumber = shipment?.waybillNumber || id;

    try {
      const result = await generateLabel(id);
      results.push({ shipmentId: id, waybillNumber, success: result.errors.length === 0, errors: result.errors });
    } catch (err: any) {
      results.push({ shipmentId: id, waybillNumber, success: false, errors: [err.message] });
    }
  }

  return results;
}

// ── Sync waybills from Holded ────────────────────────────────────

export async function syncWaybillsFromHolded(): Promise<Shipment[]> {
  const holdedClient = getHoldedClient();
  const docs = await holdedClient.listDocuments('waybill');

  const synced: Shipment[] = [];

  for (const doc of docs) {
    if (doc.pipeline?.stageId === SENT_STAGE_ID) continue;

    const existing = repo.getShipmentByHoldedDocId(doc.id);
    if (existing && existing.localStatus === 'SENT_BY_API') continue;

    const addr = doc.shippingAddress || doc.billingAddress || {};

    const shipmentData: Partial<Shipment> = {
      holdedDocumentId: doc.id,
      holdedDocType: 'waybill',
      waybillNumber: doc.docNumber || '',
      recipientName: doc.contactName || '',
      recipientCommercialName: doc.contactTradeName || '',
      recipientAddress: addr.address || '',
      recipientCity: addr.city || '',
      recipientProvince: addr.province || '',
      recipientPostcode: addr.postalCode || '',
      recipientCountry: addr.countryCode || addr.country || '',
      recipientPhone: doc.phone || '',
      recipientEmail: doc.email || '',
    };

    if (existing) {
      synced.push(repo.updateShipment(existing.id, shipmentData)!);
    } else {
      synced.push(repo.createShipment({ ...shipmentData, holdedDocumentId: doc.id }));
    }
  }

  return synced;
}
