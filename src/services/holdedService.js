const axios = require('axios');

const HOLDED_API_BASE = 'https://api.holded.com/api/invoicing/v1';

/**
 * Get the Holded API key from environment.
 */
function getApiKey() {
  return process.env.HOLDED_API_KEY || '';
}

/**
 * Create an Axios client for the Holded API.
 */
function createClient() {
  return axios.create({
    baseURL: HOLDED_API_BASE,
    headers: {
      Accept: 'application/json',
      key: getApiKey(),
    },
    timeout: 15000,
  });
}

/**
 * List delivery notes (waybills / albaranes) from Holded.
 * Holded document types: invoice, salesorder, waybill, proform, salesreceipt, purchase, purchaseorder, purchasewaybill, creditnote
 */
async function listWaybills(page = 1) {
  const client = createClient();
  const response = await client.get('/documents/waybill', {
    params: { page },
  });
  return response.data || [];
}

/**
 * Get a single waybill by ID from Holded.
 */
async function getWaybill(docId) {
  const client = createClient();
  const response = await client.get(`/documents/waybill/${docId}`);
  return response.data;
}

/**
 * Get contact details from Holded (to retrieve Commercial Name).
 * Contact object has: name, tradeName (commercial name), email, phone, etc.
 */
async function getContact(contactId) {
  const client = createClient();
  const response = await client.get(`/contacts/${contactId}`);
  return response.data;
}

/**
 * Extract shipment-relevant data from a Holded waybill document + contact.
 *
 * Holded waybill fields:
 *   - docNumber: formatted document number (e.g. "A250029")
 *   - contactId: ID of the contact/customer
 *   - contactName: name of the contact
 *   - shippingAddress: { address, city, postalCode, province, country }
 *
 * Holded contact fields:
 *   - name: legal / fiscal name
 *   - tradeName: commercial name (nombre comercial)
 *   - email, phone, mobile
 */
function extractShipmentData(waybill, contact) {
  const shippingAddr = waybill.shippingAddress || {};

  return {
    holdedDocId: waybill.id || waybill._id || '',
    holdedDocNumber: waybill.docNumber || '',
    holdedWaybillNumber: waybill.docNumber || '',

    recipientName: contact?.name || waybill.contactName || '',
    recipientCommercialName: contact?.tradeName || contact?.comercialName || '',
    recipientAddress: shippingAddr.address || '',
    recipientCity: shippingAddr.city || '',
    recipientPostalCode: shippingAddr.postalCode || '',
    recipientProvince: shippingAddr.province || '',
    recipientCountry: shippingAddr.country || 'ES',
    recipientPhone: contact?.phone || contact?.mobile || '',
    recipientEmail: contact?.email || '',
  };
}

/**
 * Update tracking info on a Holded document ("Seguimiento").
 *
 * POST /api/invoicing/v1/documents/{docType}/{documentId}/updatetracking
 * https://developers.holded.com/reference/update-tracking-info
 *
 * @param {string} docType - Document type (e.g. "waybill")
 * @param {string} documentId - Holded document ID
 * @param {object} trackingData - { trackingNumber, trackingUrl }
 * @returns {{ success: boolean, payload: object, response: any }}
 */
async function updateTracking(docType, documentId, { trackingNumber, trackingUrl }) {
  const client = createClient();

  // Holded updatetracking payload:
  // "tracking" field maps to "Seguimiento" in the Holded UI and customer emails.
  // We send the full tracking URL so it appears as a clickable link.
  const payload = {
    tracking: trackingUrl || '',
    trackingNumber: trackingNumber || '',
  };

  const redactedPayload = { ...payload };

  try {
    const response = await client.post(
      `/documents/${docType}/${documentId}/updatetracking`,
      payload,
    );
    return {
      success: true,
      payload: redactedPayload,
      response: response.data,
    };
  } catch (error) {
    return {
      success: false,
      payload: redactedPayload,
      error: error.message,
      response: error.response?.data || null,
    };
  }
}

/**
 * Clear tracking info on a Holded document (for delete/regenerate).
 */
async function clearTracking(docType, documentId) {
  return updateTracking(docType, documentId, { trackingNumber: '', trackingUrl: '' });
}

module.exports = {
  listWaybills,
  getWaybill,
  getContact,
  extractShipmentData,
  updateTracking,
  clearTracking,
};
