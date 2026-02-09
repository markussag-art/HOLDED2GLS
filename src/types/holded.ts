/** Valid Holded document types for tracking updates */
export type HoldedDocType = "waybill" | "salesorder";

/** Holded carrier keys — GLS is not natively supported, use "other" */
export type HoldedCarrierKey =
  | "mrw"
  | "ups"
  | "fedex"
  | "tnt"
  | "seur"
  | "nacex"
  | "correos"
  | "asm"
  | "uspostalservice"
  | "dbschenker"
  | "royalmail"
  | "bluedart"
  | "palletways"
  | "correosexpress"
  | "tourline"
  | "other";

/**
 * Request body for POST /api/invoicing/v1/documents/{docType}/{documentId}/updatetracking
 * All fields are optional — sending an empty object or omitting `num` clears tracking.
 */
export interface HoldedTrackingPayload {
  /** Carrier key. Use "mrw" for MRW, "other" for GLS */
  key?: HoldedCarrierKey;
  /** Display name for the carrier */
  name?: string;
  /** Tracking number(s), comma-separated */
  num?: string;
  /** Pick-up date in DD/MM/YYYY format */
  pickUpDate?: string;
  /** Delivery date in DD/MM/YYYY format */
  deliveryDate?: string;
  /** Additional notes */
  notes?: string;
}

/** Response from Holded updatetracking endpoint */
export interface HoldedTrackingResponse {
  status: number;
  info: string;
}

/** Parameters for updating tracking info */
export interface UpdateTrackingInfoParams {
  docType: HoldedDocType;
  documentId: string;
  tracking: HoldedTrackingPayload | null;
}

// --- Pipeline / Completion ---

/** Request body for POST /documents/{docType}/{documentId}/pipeline/set */
export interface HoldedPipelinePayload {
  /** Pipeline stage ID (custom per Holded account, configurable via env) */
  pipeline: string;
}

/** Generic Holded API response (used by pipeline/set and send) */
export interface HoldedApiResponse {
  status: number;
  info: string;
}

// --- Send Document ---

/** Request body for POST /documents/{docType}/{documentId}/send */
export interface HoldedSendDocumentPayload {
  /** Recipient email address(es), comma-separated */
  emails: string;
  /** Optional Holded email template ID */
  mailTemplateId?: string;
  /** Email subject (min 10 chars) */
  subject?: string;
  /** Email body text (min 20 chars) */
  message?: string;
  /** Additional document IDs */
  docIds?: string;
}

/** Parameters for completing a shipment in Holded */
export interface CompleteAndEmailParams {
  docType: HoldedDocType;
  documentId: string;
  /** Pipeline stage ID representing "Completed" */
  pipelineStageId: string;
  /** Recipient email for sending the waybill */
  recipientEmail: string;
  /** Optional mail template ID */
  mailTemplateId?: string;
}
