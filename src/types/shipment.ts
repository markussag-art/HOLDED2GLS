export type TrackingSyncStatus = "NOT_SYNCED" | "SYNCED" | "ERROR";

export type Carrier = "GLS" | "MRW";

export interface CreateShipmentInput {
  holdedDocType: string;
  holdedDocumentId: string;
  carrier: Carrier;
  recipientName?: string;
  recipientAddress?: string;
  recipientCity?: string;
  recipientPostalCode?: string;
  recipientCountry?: string;
  weight?: number;
  packages?: number;
  reference?: string;
}

export interface ShipmentDTO {
  id: string;
  createdAt: string;
  updatedAt: string;
  holdedDocType: string;
  holdedDocumentId: string;
  carrier: Carrier;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelData: string | null;
  labelObsolete: boolean;
  trackingSyncedAt: string | null;
  trackingSyncStatus: TrackingSyncStatus;
  trackingSyncError: string | null;
  recipientName: string | null;
  recipientAddress: string | null;
  recipientCity: string | null;
  recipientPostalCode: string | null;
  recipientCountry: string | null;
  weight: number | null;
  packages: number | null;
  reference: string | null;
}
