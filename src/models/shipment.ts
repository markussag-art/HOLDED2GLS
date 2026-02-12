/**
 * Shipment model — represents a Holded waybill synced with GLS.
 *
 * Sync status per Holded field allows granular retry.
 */

export type SyncStatus = 'NOT_SYNCED' | 'SYNCED' | 'ERROR';
export type LocalStatus = 'PENDING' | 'LABELED' | 'SENT_BY_API' | 'ERROR';

export interface Shipment {
  id: string;                          // internal UUID
  holdedDocumentId: string;            // Holded document ID (waybill)
  holdedDocType: string;               // e.g. "waybill"

  // Recipient / address
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  recipientPostcode: string;
  recipientCountry: string;            // ISO 2-letter: ES, PT, …
  recipientPhone: string;
  recipientEmail: string;

  // GLS shipment data
  trackingNumber: string | null;
  expeditionId: string | null;         // required for PT tracking URL
  labelPdfPath: string | null;

  // Tracking URL (built from ES/PT rules)
  trackingUrl: string | null;

  // Holded sync statuses (granular)
  holdedTrackingSyncStatus: SyncStatus;
  holdedTrackingSyncError: string | null;

  holdedCustomFieldSyncStatus: SyncStatus;
  holdedCustomFieldSyncError: string | null;

  holdedStageSyncStatus: SyncStatus;
  holdedStageSyncError: string | null;
  holdedStageIdLastSet: string | null;

  // Overall local status
  localStatus: LocalStatus;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

/** Column list for DB inserts / selects */
export const SHIPMENT_COLUMNS = [
  'id',
  'holdedDocumentId',
  'holdedDocType',
  'recipientName',
  'recipientAddress',
  'recipientCity',
  'recipientPostcode',
  'recipientCountry',
  'recipientPhone',
  'recipientEmail',
  'trackingNumber',
  'expeditionId',
  'labelPdfPath',
  'trackingUrl',
  'holdedTrackingSyncStatus',
  'holdedTrackingSyncError',
  'holdedCustomFieldSyncStatus',
  'holdedCustomFieldSyncError',
  'holdedStageSyncStatus',
  'holdedStageSyncError',
  'holdedStageIdLastSet',
  'localStatus',
  'createdAt',
  'updatedAt',
] as const;
