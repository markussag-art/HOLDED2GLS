/**
 * Tracking URL builder.
 *
 * Destination country decides format:
 *  - ES (Spain):   https://mygls.gls-spain.es/e/<TRACKING_NUMBER>/<POSTCODE_DIGITS>
 *  - PT (Portugal): https://mygls.gls-spain.es/expedition/<EXPEDITION_UUID>
 */

export interface TrackingUrlInput {
  country: string;           // ISO 2-letter
  trackingNumber: string;
  postcode?: string;         // required for ES
  expeditionId?: string;     // required for PT
}

export function buildTrackingUrl(input: TrackingUrlInput): string | null {
  const country = input.country.toUpperCase();

  if (country === 'ES') {
    if (!input.postcode) return null;
    const digits = input.postcode.replace(/\D/g, '');
    if (!digits) return null;
    return `https://mygls.gls-spain.es/e/${input.trackingNumber}/${digits}`;
  }

  if (country === 'PT') {
    if (!input.expeditionId) return null;
    return `https://mygls.gls-spain.es/expedition/${input.expeditionId}`;
  }

  // Unsupported country
  return null;
}

export function isValidTrackingUrl(url: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'mygls.gls-spain.es';
  } catch {
    return false;
  }
}
