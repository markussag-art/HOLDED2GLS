import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { Shipment, SyncStatus, LocalStatus } from './shipment';

export function createShipment(data: Partial<Shipment> & Pick<Shipment, 'holdedDocumentId'>): Shipment {
  const db = getDb();
  const now = new Date().toISOString();
  const id = data.id || uuidv4();

  const shipment: Shipment = {
    id,
    holdedDocumentId: data.holdedDocumentId,
    holdedDocType: data.holdedDocType || 'waybill',
    recipientName: data.recipientName || '',
    recipientAddress: data.recipientAddress || '',
    recipientCity: data.recipientCity || '',
    recipientPostcode: data.recipientPostcode || '',
    recipientCountry: data.recipientCountry || '',
    recipientPhone: data.recipientPhone || '',
    recipientEmail: data.recipientEmail || '',
    trackingNumber: data.trackingNumber || null,
    expeditionId: data.expeditionId || null,
    labelPdfPath: data.labelPdfPath || null,
    trackingUrl: data.trackingUrl || null,
    holdedTrackingSyncStatus: data.holdedTrackingSyncStatus || 'NOT_SYNCED',
    holdedTrackingSyncError: data.holdedTrackingSyncError || null,
    holdedCustomFieldSyncStatus: data.holdedCustomFieldSyncStatus || 'NOT_SYNCED',
    holdedCustomFieldSyncError: data.holdedCustomFieldSyncError || null,
    holdedStageSyncStatus: data.holdedStageSyncStatus || 'NOT_SYNCED',
    holdedStageSyncError: data.holdedStageSyncError || null,
    holdedStageIdLastSet: data.holdedStageIdLastSet || null,
    localStatus: data.localStatus || 'PENDING',
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
  };

  db.prepare(`
    INSERT INTO shipments (
      id, holdedDocumentId, holdedDocType,
      recipientName, recipientAddress, recipientCity,
      recipientPostcode, recipientCountry, recipientPhone, recipientEmail,
      trackingNumber, expeditionId, labelPdfPath, trackingUrl,
      holdedTrackingSyncStatus, holdedTrackingSyncError,
      holdedCustomFieldSyncStatus, holdedCustomFieldSyncError,
      holdedStageSyncStatus, holdedStageSyncError, holdedStageIdLastSet,
      localStatus, createdAt, updatedAt
    ) VALUES (
      @id, @holdedDocumentId, @holdedDocType,
      @recipientName, @recipientAddress, @recipientCity,
      @recipientPostcode, @recipientCountry, @recipientPhone, @recipientEmail,
      @trackingNumber, @expeditionId, @labelPdfPath, @trackingUrl,
      @holdedTrackingSyncStatus, @holdedTrackingSyncError,
      @holdedCustomFieldSyncStatus, @holdedCustomFieldSyncError,
      @holdedStageSyncStatus, @holdedStageSyncError, @holdedStageIdLastSet,
      @localStatus, @createdAt, @updatedAt
    )
  `).run(shipment);

  return shipment;
}

export function getShipmentById(id: string): Shipment | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM shipments WHERE id = ?').get(id) as Shipment | undefined;
}

export function getShipmentByHoldedDocId(holdedDocumentId: string): Shipment | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM shipments WHERE holdedDocumentId = ?').get(holdedDocumentId) as Shipment | undefined;
}

export function getAllShipments(): Shipment[] {
  const db = getDb();
  return db.prepare('SELECT * FROM shipments ORDER BY updatedAt DESC').all() as Shipment[];
}

export function getShipmentsByStatus(localStatus: LocalStatus): Shipment[] {
  const db = getDb();
  return db.prepare('SELECT * FROM shipments WHERE localStatus = ? ORDER BY updatedAt DESC').all(localStatus) as Shipment[];
}

export function getShipmentsWithSyncErrors(): Shipment[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM shipments
    WHERE holdedTrackingSyncStatus = 'ERROR'
       OR holdedCustomFieldSyncStatus = 'ERROR'
       OR holdedStageSyncStatus = 'ERROR'
    ORDER BY updatedAt DESC
  `).all() as Shipment[];
}

export function updateShipment(id: string, updates: Partial<Shipment>): Shipment | undefined {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = getShipmentById(id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: Record<string, unknown> = { id };

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'id' || key === 'createdAt') continue;
    fields.push(`${key} = @${key}`);
    values[key] = value;
  }

  fields.push('updatedAt = @updatedAt');
  values.updatedAt = now;

  if (fields.length === 0) return existing;

  db.prepare(`UPDATE shipments SET ${fields.join(', ')} WHERE id = @id`).run(values);
  return getShipmentById(id);
}

export function deleteShipment(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM shipments WHERE id = ?').run(id);
  return result.changes > 0;
}
