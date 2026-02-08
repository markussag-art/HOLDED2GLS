/**
 * GLS Spain API integration for label creation and shipment management.
 *
 * This service handles communication with the GLS web services to:
 * - Create shipments and generate labels
 * - Cancel shipments (optional)
 * - Generate tracking URLs
 *
 * In production, replace the mock implementations with actual GLS API calls.
 */

export interface GLSShipmentRequest {
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  recipientPostalCode: string;
  recipientCountry: string;
  weight: number;
  packages: number;
  reference?: string;
}

export interface GLSShipmentResponse {
  trackingNumber: string;
  labelData: string; // Base64-encoded PDF label
  trackingUrl: string;
}

const GLS_API_BASE = process.env.GLS_API_URL ?? "https://wsclientes.asmred.com";
const GLS_TRACKING_BASE = "https://www.gls-spain.es/es/ayuda/seguimiento";

function getGLSCredentials() {
  return {
    user: process.env.GLS_USER ?? "",
    password: process.env.GLS_PASSWORD ?? "",
    uidClient: process.env.GLS_UID_CLIENT ?? "",
  };
}

/**
 * Generate a GLS tracking URL from a tracking number.
 */
export function generateGLSTrackingUrl(trackingNumber: string): string {
  return `${GLS_TRACKING_BASE}/?match=${encodeURIComponent(trackingNumber)}`;
}

/**
 * Create a GLS shipment and generate a label.
 * Returns tracking number and label data.
 *
 * In production, this calls the GLS/ASM web service (SOAP or REST).
 * For now, this uses a simulated implementation that generates realistic data.
 */
export async function createGLSShipment(
  request: GLSShipmentRequest
): Promise<GLSShipmentResponse> {
  const credentials = getGLSCredentials();

  // If GLS API credentials are configured, use the real API
  if (credentials.user && credentials.password) {
    return callGLSApi(request, credentials);
  }

  // Fallback: simulated response for development/testing
  return simulateGLSShipment(request);
}

/**
 * Cancel a GLS shipment by tracking number.
 * Returns true if cancellation succeeded.
 */
export async function cancelGLSShipment(
  trackingNumber: string
): Promise<boolean> {
  const credentials = getGLSCredentials();

  if (credentials.user && credentials.password) {
    return callGLSCancelApi(trackingNumber, credentials);
  }

  // Simulated: always succeed in dev
  return true;
}

// --- Internal implementations ---

async function callGLSApi(
  request: GLSShipmentRequest,
  credentials: { user: string; password: string; uidClient: string }
): Promise<GLSShipmentResponse> {
  // GLS/ASM SOAP service call
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GrabarEnvio xmlns="http://www.asmred.com/">
      <uidcliente>${credentials.uidClient}</uidcliente>
      <usuario>${credentials.user}</usuario>
      <password>${credentials.password}</password>
      <nombre_dst>${escapeXml(request.recipientName)}</nombre_dst>
      <direccion_dst>${escapeXml(request.recipientAddress)}</direccion_dst>
      <poblacion_dst>${escapeXml(request.recipientCity)}</poblacion_dst>
      <cp_dst>${escapeXml(request.recipientPostalCode)}</cp_dst>
      <pais_dst>${escapeXml(request.recipientCountry)}</pais_dst>
      <peso>${request.weight}</peso>
      <bultos>${request.packages}</bultos>
      <referencia>${escapeXml(request.reference ?? "")}</referencia>
    </GrabarEnvio>
  </soap:Body>
</soap:Envelope>`;

  const response = await fetch(`${GLS_API_BASE}/services.asmx`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://www.asmred.com/GrabarEnvio",
    },
    body: soapBody,
  });

  if (!response.ok) {
    throw new Error(`GLS API error: ${response.status} ${response.statusText}`);
  }

  const responseText = await response.text();

  // Parse SOAP response to extract tracking number and label
  const trackingMatch = responseText.match(
    /<codbarras>(.*?)<\/codbarras>/
  );
  const labelMatch = responseText.match(/<etiqueta>(.*?)<\/etiqueta>/);

  if (!trackingMatch?.[1]) {
    // Check for error in response
    const errorMatch = responseText.match(/<resultado>(.*?)<\/resultado>/);
    throw new Error(
      `GLS shipment creation failed: ${errorMatch?.[1] ?? "Unknown error"}`
    );
  }

  const trackingNumber = trackingMatch[1];

  return {
    trackingNumber,
    labelData: labelMatch?.[1] ?? "",
    trackingUrl: generateGLSTrackingUrl(trackingNumber),
  };
}

async function callGLSCancelApi(
  trackingNumber: string,
  credentials: { user: string; password: string; uidClient: string }
): Promise<boolean> {
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <AnularEnvio xmlns="http://www.asmred.com/">
      <uidcliente>${credentials.uidClient}</uidcliente>
      <usuario>${credentials.user}</usuario>
      <password>${credentials.password}</password>
      <codbarras>${escapeXml(trackingNumber)}</codbarras>
    </AnularEnvio>
  </soap:Body>
</soap:Envelope>`;

  const response = await fetch(`${GLS_API_BASE}/services.asmx`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://www.asmred.com/AnularEnvio",
    },
    body: soapBody,
  });

  return response.ok;
}

function simulateGLSShipment(
  _request: GLSShipmentRequest
): GLSShipmentResponse {
  const trackingNumber = `GLS${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  return {
    trackingNumber,
    labelData: Buffer.from(`SIMULATED_LABEL_${trackingNumber}`).toString(
      "base64"
    ),
    trackingUrl: generateGLSTrackingUrl(trackingNumber),
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
