import type {
  HoldedTrackingPayload,
  HoldedTrackingResponse,
  HoldedApiResponse,
  HoldedSendDocumentPayload,
  HoldedDocType,
  UpdateTrackingInfoParams,
} from "@/types/holded";

const HOLDED_API_BASE = "https://api.holded.com/api/invoicing/v1";

function getApiKey(): string {
  const key = process.env.HOLDED_API_KEY;
  if (!key) {
    throw new Error("HOLDED_API_KEY environment variable is not set");
  }
  return key;
}

/** Shared helper for all Holded POST/PUT requests */
async function holdedRequest(
  url: string,
  body: unknown,
  method: "POST" | "PUT" = "POST"
): Promise<HoldedApiResponse> {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      key: getApiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new HoldedApiError(
      `Holded API error ${response.status}: ${errorText}`,
      response.status,
      errorText
    );
  }

  return response.json();
}

/** Empty payload used to clear tracking from a Holded document */
const CLEAR_TRACKING_PAYLOAD: HoldedTrackingPayload = { num: "" };

/**
 * Holded API client for document operations.
 */
export const holded = {
  /**
   * Update tracking info on a Holded document.
   * Pass `tracking: null` to clear tracking.
   *
   * POST /documents/{docType}/{documentId}/updatetracking
   */
  async updateTrackingInfo(
    params: UpdateTrackingInfoParams
  ): Promise<HoldedTrackingResponse> {
    const { docType, documentId, tracking } = params;
    const url = `${HOLDED_API_BASE}/documents/${docType}/${documentId}/updatetracking`;
    const body: HoldedTrackingPayload = tracking ?? CLEAR_TRACKING_PAYLOAD;
    return holdedRequest(url, body) as Promise<HoldedTrackingResponse>;
  },

  /**
   * Set the pipeline stage on a Holded document (e.g. mark as "Completed").
   *
   * POST /documents/{docType}/{documentId}/pipeline/set
   *
   * The pipeline stage ID is custom per Holded account.
   * Configure via HOLDED_COMPLETED_PIPELINE_ID env var.
   */
  async setPipelineStage(params: {
    docType: HoldedDocType;
    documentId: string;
    pipelineStageId: string;
  }): Promise<HoldedApiResponse> {
    const { docType, documentId, pipelineStageId } = params;
    const url = `${HOLDED_API_BASE}/documents/${docType}/${documentId}/pipeline/set`;
    return holdedRequest(url, { pipeline: pipelineStageId });
  },

  /**
   * Send a document by email from Holded.
   *
   * POST /documents/{docType}/{documentId}/send
   *
   * The `emails` field is required by the Holded API.
   */
  async sendDocument(params: {
    docType: HoldedDocType;
    documentId: string;
    payload: HoldedSendDocumentPayload;
  }): Promise<HoldedApiResponse> {
    const { docType, documentId, payload } = params;
    const url = `${HOLDED_API_BASE}/documents/${docType}/${documentId}/send`;
    return holdedRequest(url, payload);
  },
};

export class HoldedApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = "HoldedApiError";
  }
}
