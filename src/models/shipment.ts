/**
 * Shipment model — represents a Holded waybill synced with GLS.
 *
 * Sync status per Holded field allows granular retry.
 */

export type SyncStatus = 'NOT_SYNCED' | 'SYNCED' | 'ERROR';
export type LocalStatus = 'PENDING' | 'LABELED' | 'SENT_BY_API' | 'ERROR';

export type ShippingMethod =
  | 'COURIER_EXPRESS_19'
  | 'ECONOMY_PARCEL_BALEARES'
  | 'INTERNACIONAL'
  | '';

export const SHIPPING_METHODS: { code: ShippingMethod; label: string; glsServiceCode: string }[] = [
  { code: 'COURIER_EXPRESS_19', label: 'ENTREGA ESTANDAR NACIONAL - COURIER EXPRESS 19:00', glsServiceCode: '1' },
  { code: 'ECONOMY_PARCEL_BALEARES', label: 'ENTREGA ESTANDAR BALEARES - ECONOMY PARCEL2', glsServiceCode: '74' },
  { code: 'INTERNACIONAL', label: 'ENTREGA ESTANDAR INTERNACIONAL', glsServiceCode: '10' },
];

export interface Shipment {
  id: string;                          // internal UUID
  holdedDocumentId: string;            // Holded document ID (waybill)
  holdedDocType: string;               // e.g. "waybill"
  waybillNumber: string;               // Holded document number (e.g. A250029)

  // Recipient / address
  recipientName: string;
  recipientCommercialName: string;     // Holded "razón social" / commercial name
  recipientAddress: string;
  recipientCity: string;
  recipientProvince: string;
  recipientPostcode: string;
  recipientCountry: string;            // ISO 2-letter: ES, PT, …
  recipientPhone: string;
  recipientEmail: string;

  // Shipment parameters (set before label generation)
  weight: number;                      // kg
  packages: number;
  shippingMethod: ShippingMethod;
  deliveryNotes: string;               // e.g. "Entregar por la mañana"

  // GLS shipment data
  trackingNumber: string | null;
  expeditionId: string | null;         // required for PT tracking URL
  labelPdfPath: string | null;
  glsRawResponse: string | null;       // redacted JSON snapshot of GLS SOAP response

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
  'waybillNumber',
  'recipientName',
  'recipientCommercialName',
  'recipientAddress',
  'recipientCity',
  'recipientProvince',
  'recipientPostcode',
  'recipientCountry',
  'recipientPhone',
  'recipientEmail',
  'weight',
  'packages',
  'shippingMethod',
  'deliveryNotes',
  'trackingNumber',
  'expeditionId',
  'labelPdfPath',
  'glsRawResponse',
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
