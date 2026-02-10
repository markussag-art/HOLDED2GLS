const soap = require('soap');
const { GLS_CONFIG, getShippingMethodByKey, DELIVERY_WINDOWS } = require('../config/gls');

let soapClient = null;

/**
 * GLS tracking URL base paths by country.
 */
const GLS_TRACKING_BASES = {
  ES: 'https://mygls.gls-spain.es/e',
  PT_EXPEDITION: 'https://mygls.gls-spain.es/expedition',
};

/**
 * Get or create the SOAP client for GLS Spain (ASM) b2b API.
 */
async function getClient() {
  if (soapClient) return soapClient;
  soapClient = await soap.createClientAsync(GLS_CONFIG.wsdlUrl);
  return soapClient;
}

/**
 * Build the full GLS tracking URL based on destination country.
 *
 * Rules:
 *  - ES: https://mygls.gls-spain.es/e/<trackingNumber>/<postcode>
 *  - PT: https://mygls.gls-spain.es/expedition/<expeditionId>
 *  - Other: ES format if postcode available, otherwise throws.
 *
 * @param {object} params
 * @param {string} params.trackingNumber - GLS parcel/shipment number
 * @param {string} params.postcode - Destination postcode (digits only)
 * @param {string} params.country - ISO-2 country code
 * @param {string} [params.expeditionId] - GLS expedition UUID (required for PT)
 * @returns {string} Full tracking URL
 */
function buildTrackingUrl({ trackingNumber, postcode, country, expeditionId }) {
  const normalizedCountry = (country || '').toUpperCase().trim();
  const normalizedPostcode = (postcode || '').replace(/\D/g, '');

  if (!trackingNumber && normalizedCountry !== 'PT') {
    throw new Error('Missing GLS tracking number for tracking URL.');
  }

  if (normalizedCountry === 'PT') {
    if (!expeditionId) {
      throw new Error('Missing GLS expedition ID for Portugal tracking.');
    }
    return `${GLS_TRACKING_BASES.PT_EXPEDITION}/${expeditionId}`;
  }

  if (normalizedCountry === 'ES') {
    if (!normalizedPostcode) {
      throw new Error('Missing destination postcode for GLS Spain tracking.');
    }
    return `${GLS_TRACKING_BASES.ES}/${trackingNumber}/${normalizedPostcode}`;
  }

  // Other countries: default to ES format if postcode exists
  if (normalizedPostcode) {
    console.warn(`[GLS Tracking] Country "${normalizedCountry}" using ES-format URL as fallback.`);
    return `${GLS_TRACKING_BASES.ES}/${trackingNumber}/${normalizedPostcode}`;
  }

  throw new Error(`Cannot build tracking URL for country "${normalizedCountry}" without postcode. Provide a valid destination postcode.`);
}

/**
 * Build the reference string from a Holded waybill number.
 * Format: "Ref. Cli. Albaran <NUMBER>"
 */
function buildReferenceString(holdedWaybillNumber) {
  if (!holdedWaybillNumber) return '';
  return `Ref. Cli. Albaran ${holdedWaybillNumber}`;
}

/**
 * Build the delivery notes/observations string from morning/afternoon flags.
 */
function buildDeliveryNotes(deliveryMorning, deliveryAfternoon, extraNotes) {
  const parts = [];
  if (deliveryMorning) parts.push(DELIVERY_WINDOWS.MORNING);
  if (deliveryAfternoon) parts.push(DELIVERY_WINDOWS.AFTERNOON);
  if (extraNotes) parts.push(extraNotes);
  return parts.join(' | ');
}

/**
 * Build the full GLS SOAP payload for GrabarEnvio (create shipment).
 *
 * GLS Spain SOAP field mapping (see docs/INTEGRATIONS.md):
 *  - Plaza         → sender postal code area
 *  - Bultos        → number of packages
 *  - Peso          → weight in kg
 *  - Portes        → payment type (P=prepaid)
 *  - Servicio      → GLS service code (1, 10, 74)
 *  - Horario       → delivery schedule (e.g. "19:00")
 *  - Remite_Nombre → sender name
 *  - Remite_Direccion → sender address
 *  - Remite_Poblacion → sender city
 *  - Remite_CP     → sender postal code
 *  - Remite_Pais   → sender country ISO
 *  - Remite_NIF    → sender CIF/NIF
 *  - Nombre        → recipient name line 1 (Commercial Name)
 *  - Nombre2       → recipient name line 2 (Legal Name if different)
 *  - Direccion     → recipient address
 *  - Poblacion     → recipient city
 *  - CP            → recipient postal code
 *  - Pais          → recipient country ISO
 *  - Telefono      → recipient phone
 *  - Email         → recipient email
 *  - Referencia    → customer reference (waybill: "Ref. Cli. Albaran XXXX")
 *  - Observaciones → delivery notes / observations (morning/afternoon)
 */
function buildGlsPayload(shipment) {
  const method = getShippingMethodByKey(shipment.shippingMethod || shipment.shipping_method);
  if (!method) {
    throw new Error(`Unknown shipping method: ${shipment.shippingMethod || shipment.shipping_method}`);
  }

  const recipientCommercialName = shipment.recipientCommercialName || shipment.recipient_commercial_name || '';
  const recipientName = shipment.recipientName || shipment.recipient_name || '';
  const holdedWaybill = shipment.holdedWaybillNumber || shipment.holded_waybill_number || '';

  // Commercial Name goes to primary name field; legal name to secondary
  const nameLine1 = recipientCommercialName || recipientName;
  const nameLine2 = recipientCommercialName && recipientName && recipientCommercialName !== recipientName
    ? recipientName
    : '';

  const referenceStr = buildReferenceString(holdedWaybill);

  const deliveryMorning = shipment.deliveryMorning !== undefined
    ? shipment.deliveryMorning
    : shipment.delivery_morning;
  const deliveryAfternoon = shipment.deliveryAfternoon !== undefined
    ? shipment.deliveryAfternoon
    : shipment.delivery_afternoon;
  const extraNotes = shipment.deliveryNotes || shipment.delivery_notes || '';
  const observations = buildDeliveryNotes(deliveryMorning, deliveryAfternoon, extraNotes);

  const payload = {
    uidcliente: GLS_CONFIG.uid,
    FechaEnvio: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
    Plaza: '',
    Bultos: String(shipment.packages || shipment.packages || 1),
    Peso: String(shipment.weight || 1),
    Portes: 'P', // Prepaid
    Servicio: method.glsServiceCode,
    Horario: method.glsSchedule || '',
    // Sender / Emitter
    Remite_Nombre: shipment.senderName || shipment.sender_name || 'Yogufruta SCP',
    Remite_Direccion: shipment.senderAddress || shipment.sender_address || 'C/ LA SELVA, 26 1º-2',
    Remite_Poblacion: shipment.senderCity || shipment.sender_city || 'Blanes',
    Remite_CP: shipment.senderPostalCode || shipment.sender_postal_code || '17300',
    Remite_Pais: shipment.senderCountry || shipment.sender_country || 'ES',
    Remite_Telefono: shipment.senderPhone || shipment.sender_phone || '',
    Remite_Email: shipment.senderEmail || shipment.sender_email || '',
    Remite_NIF: shipment.senderCif || shipment.sender_cif || 'J65549842',
    // Recipient
    Nombre: nameLine1,
    Nombre2: nameLine2,
    Direccion: shipment.recipientAddress || shipment.recipient_address || '',
    Poblacion: shipment.recipientCity || shipment.recipient_city || '',
    CP: shipment.recipientPostalCode || shipment.recipient_postal_code || '',
    Pais: shipment.recipientCountry || shipment.recipient_country || 'ES',
    Telefono: shipment.recipientPhone || shipment.recipient_phone || '',
    Email: shipment.recipientEmail || shipment.recipient_email || '',
    // Reference – Holded waybill
    Referencia: referenceStr,
    // Observations – delivery window notes
    Observaciones: observations,
  };

  return payload;
}

/**
 * Redact secrets from payload for debug display.
 */
function redactPayload(payload) {
  const redacted = { ...payload };
  if (redacted.uidcliente) {
    redacted.uidcliente = redacted.uidcliente.slice(0, 4) + '****';
  }
  return redacted;
}

/**
 * Extract expedition ID and tracking number from GLS SOAP response.
 * For PT destinations, the expedition UUID is a separate field.
 */
function extractGlsResponseData(response) {
  const trackingNumber = response?.Expedicion || response?.NumeroEnvio || response?.CodigoBarras || '';
  const expeditionId = response?.ExpedicionUUID || response?.UID || response?.Uid || '';
  const labelBase64 = response?.Etiqueta || response?.Label || '';

  return { trackingNumber, expeditionId, labelBase64 };
}

/**
 * Send shipment to GLS via SOAP and retrieve label.
 * Returns { trackingNumber, expeditionId, labelBase64, rawResponse }.
 */
async function createShipment(shipment) {
  const payload = buildGlsPayload(shipment);
  const redacted = redactPayload(payload);

  try {
    const client = await getClient();

    // GLS Spain uses GrabarEnvio method in the b2b SOAP API
    const [result] = await client.GrabarEnvioAsync({ Ession: payload });

    const response = result?.GrabarEnvioResult || result;
    const { trackingNumber, expeditionId, labelBase64 } = extractGlsResponseData(response);

    return {
      success: true,
      trackingNumber,
      expeditionId,
      labelBase64,
      requestPayload: redacted,
      rawResponse: response,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      requestPayload: redacted,
      rawResponse: null,
    };
  }
}

module.exports = {
  getClient,
  buildTrackingUrl,
  buildGlsPayload,
  buildReferenceString,
  buildDeliveryNotes,
  redactPayload,
  extractGlsResponseData,
  createShipment,
  GLS_TRACKING_BASES,
};
