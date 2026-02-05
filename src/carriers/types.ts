export interface ShipmentAddress {
  name: string;
  company?: string;
  street: string;
  street2?: string;
  city: string;
  province?: string;
  postalCode: string;
  country: string;
  countryCode: string;
  phone?: string;
  email?: string;
  contactPerson?: string;
}

export interface ParcelInfo {
  weight: number; // kg
  reference?: string;
}

export interface CreateShipmentPayload {
  sender: ShipmentAddress;
  recipient: ShipmentAddress;
  parcels: ParcelInfo[];
  serviceType: string;
  serviceCode: string;
  reference?: string;
  customerReference?: string;
  shippingDate?: string; // YYYY-MM-DD
  notes?: string;
}

export interface CreateShipmentResult {
  success: boolean;
  trackingNumber: string;
  labelPdfBase64?: string;
  labelUrl?: string;
  parcelNumbers?: string[];
  rawResponse: Record<string, unknown>;
  errorMessage?: string;
}

export interface CancelShipmentResult {
  success: boolean;
  rawResponse: Record<string, unknown>;
  errorMessage?: string;
}

export interface CarrierAdapter {
  readonly carrierName: string;

  createShipment(
    payload: CreateShipmentPayload,
    credentials: Record<string, string>
  ): Promise<CreateShipmentResult>;

  cancelShipment(
    trackingNumber: string,
    credentials: Record<string, string>
  ): Promise<CancelShipmentResult>;

  getLabel(
    trackingNumber: string,
    credentials: Record<string, string>
  ): Promise<{ pdfBase64: string } | null>;

  getServiceTypes(): Array<{
    code: string;
    name: string;
    description: string;
    international: boolean;
  }>;
}
