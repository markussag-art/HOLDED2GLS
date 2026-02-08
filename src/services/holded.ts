import type {
  HoldedTrackingPayload,
  HoldedTrackingResponse,
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

/** Empty payload used to clear tracking from a Holded document */
const CLEAR_TRACKING_PAYLOAD: HoldedTrackingPayload = { num: "" };

/**
 * Holded API client for tracking operations.
 *
 * POST /documents/{docType}/{documentId}/updatetracking
 *
 * To set tracking: send { key, name, num } with valid values.
 * To clear tracking: send { num: "" }.
 */
export const holded = {
  /**
   * Update tracking info on a Holded document.
   * Pass `tracking: null` to clear tracking.
   */
  async updateTrackingInfo(
    params: UpdateTrackingInfoParams
  ): Promise<HoldedTrackingResponse> {
    const { docType, documentId, tracking } = params;
    const url = `${HOLDED_API_BASE}/documents/${docType}/${documentId}/updatetracking`;

    const body: HoldedTrackingPayload = tracking ?? CLEAR_TRACKING_PAYLOAD;

    const response = await fetch(url, {
      method: "POST",
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

    const data: HoldedTrackingResponse = await response.json();
    return data;
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
