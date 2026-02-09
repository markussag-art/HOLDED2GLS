/**
 * GLS Spain B2B SOAP API integration.
 *
 * Endpoint: https://wsclientes.asmred.com/b2b.asmx
 * Uses SOAP 1.2 with GrabaServicios for shipment creation,
 * EtiquetaEnvio for label retrieval, and Anula for cancellation.
 *
 * Authentication is via the uidcliente attribute (no user/password needed for B2B).
 */

import { proxyFetch } from "@/lib/fetch";

export interface GLSShipmentRequest {
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  recipientPostalCode: string;
  recipientCountry: string;
  recipientPhone?: string;
  recipientEmail?: string;
  recipientProvince?: string;
  weight: number;
  packages: number;
  reference?: string;
  notes?: string;
  // Sender info (optional — uses defaults if not provided)
  senderName?: string;
  senderAddress?: string;
  senderCity?: string;
  senderPostalCode?: string;
  senderCountry?: string;
}

export interface GLSShipmentResponse {
  trackingNumber: string;
  labelData: string; // Base64-encoded PDF label
  trackingUrl: string;
}

/** Validation errors for label-ready checks */
export interface LabelValidationError {
  field: string;
  message: string;
}

const GLS_B2B_ENDPOINT =
  process.env.GLS_WSDL_URL?.replace("?wsdl", "") ??
  `${process.env.GLS_API_URL ?? "https://wsclientes.asmred.com"}/b2b.asmx`;

const GLS_TRACKING_BASE = "https://www.gls-spain.es/es/ayuda/seguimiento";
const ASM_NAMESPACE = "http://www.asmred.com/";

function getUidClient(): string {
  const uid = process.env.GLS_UID_CLIENT ?? "";
  if (!uid) {
    throw new Error("GLS_UID_CLIENT environment variable is not set");
  }
  return uid;
}

/**
 * Validate that a shipment request has all required fields for GLS label generation.
 * Returns an array of validation errors (empty = valid).
 */
export function validateLabelReady(request: Partial<GLSShipmentRequest>): LabelValidationError[] {
  const errors: LabelValidationError[] = [];

  if (!request.recipientName?.trim()) {
    errors.push({ field: "recipientName", message: "Recipient name is required" });
  }
  if (!request.recipientAddress?.trim()) {
    errors.push({ field: "recipientAddress", message: "Recipient address is required" });
  }
  if (!request.recipientCity?.trim()) {
    errors.push({ field: "recipientCity", message: "Recipient city is required" });
  }
  if (!request.recipientPostalCode?.trim()) {
    errors.push({ field: "recipientPostalCode", message: "Postal code is required" });
  }
  if (!request.recipientPhone?.trim()) {
    errors.push({ field: "recipientPhone", message: "Recipient phone is required" });
  }
  if (!request.weight || request.weight <= 0) {
    errors.push({ field: "weight", message: "Weight must be greater than 0" });
  }
  if (!request.packages || request.packages < 1) {
    errors.push({ field: "packages", message: "Package count must be at least 1" });
  }

  return errors;
}

/**
 * Generate a GLS tracking URL from a tracking number.
 */
export function generateGLSTrackingUrl(trackingNumber: string): string {
  return `${GLS_TRACKING_BASE}/?match=${encodeURIComponent(trackingNumber)}`;
}

/**
 * Create a GLS shipment via B2B SOAP API and return tracking + label.
 *
 * Uses GrabaServicios with inline label request via <DevuelveAdicionales>.
 * Falls back to EtiquetaEnvio if inline label is not returned.
 */
export async function createGLSShipment(
  request: GLSShipmentRequest
): Promise<GLSShipmentResponse> {
  const uidClient = getUidClient();

  // If UID is the test key, still use the real API
  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  const docIn = buildGrabaServiciosXml(uidClient, request, dateStr);

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <GrabaServicios xmlns="${ASM_NAMESPACE}">
      <docIn>${docIn}</docIn>
    </GrabaServicios>
  </soap12:Body>
</soap12:Envelope>`;

  console.log("[GLS] Calling GrabaServicios at", GLS_B2B_ENDPOINT);

  const response = await proxyFetch(GLS_B2B_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/soap+xml; charset=utf-8",
    },
    body: soapEnvelope,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `GLS B2B API error: ${response.status} ${response.statusText}. ${text.slice(0, 500)}`
    );
  }

  const responseText = await response.text();

  // Log response (redacting sensitive data)
  console.log("[GLS] GrabaServicios response length:", responseText.length);

  // Parse tracking number from response
  // codbarras can be an attribute on <Envio codbarras="..."> or element content
  const trackingNumber =
    extractXmlAttribute(responseText, "Envio", "codbarras") ||
    extractXmlAttribute(responseText, "codbarras", "codbarras") ||
    extractXmlValue(responseText, "codbarras");

  // Check for error in response: return="-109" means error, return="0" is success
  const returnCode = extractXmlAttribute(responseText, "Resultado", "return");
  const errorElement = extractXmlValue(responseText, "Error");

  if (!trackingNumber || (returnCode && returnCode !== "0" && !trackingNumber)) {
    const errorMsg = errorElement ||
      extractXmlValue(responseText, "Mensaje") ||
      extractXmlValue(responseText, "GrabaServiciosResult") ||
      responseText.slice(0, 500);
    throw new Error(`GLS shipment creation failed: ${errorMsg}`);
  }

  // Check for errors alongside tracking number
  if (errorElement && returnCode !== "0") {
    console.warn("[GLS] Warning from API:", errorElement);
  }

  // Extract inline label from <Etiquetas><Etiqueta bulto="1">base64...</Etiqueta>
  // Use specific regex to match <Etiqueta bulto="N"> (not <Etiquetas>)
  const etiquetaMatch = responseText.match(
    /<Etiqueta\s+bulto="[^"]*">([\s\S]*?)<\/Etiqueta>/i
  );
  let labelData = etiquetaMatch?.[1]?.trim() ?? "";

  // If no inline label, try separate EtiquetaEnvio call
  if (!labelData) {
    try {
      labelData = await getLabel(uidClient, trackingNumber);
    } catch (e) {
      console.warn("[GLS] EtiquetaEnvio fallback failed:", e);
      // Label retrieval is non-critical — tracking is already created
    }
  }

  return {
    trackingNumber,
    labelData,
    trackingUrl: generateGLSTrackingUrl(trackingNumber),
  };
}

/**
 * Retrieve a label for an existing shipment via EtiquetaEnvio.
 */
export async function getLabel(
  uidClient: string,
  trackingNumber: string,
  labelType: string = "PDF"
): Promise<string> {
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <EtiquetaEnvio xmlns="${ASM_NAMESPACE}">
      <uidCliente>${escapeXml(uidClient)}</uidCliente>
      <codigo>${escapeXml(trackingNumber)}</codigo>
      <tipoEtiqueta>${escapeXml(labelType)}</tipoEtiqueta>
      <plataforma></plataforma>
    </EtiquetaEnvio>
  </soap12:Body>
</soap12:Envelope>`;

  console.log("[GLS] Calling EtiquetaEnvio for", trackingNumber);

  const response = await proxyFetch(GLS_B2B_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/soap+xml; charset=utf-8",
    },
    body: soapEnvelope,
  });

  if (!response.ok) {
    throw new Error(`GLS EtiquetaEnvio error: ${response.status}`);
  }

  const responseText = await response.text();

  // The response contains base64Binary data
  const base64Match = responseText.match(/<base64Binary>([\s\S]*?)<\/base64Binary>/);
  if (base64Match?.[1]) {
    return base64Match[1].trim();
  }

  // Try alternate response format
  const resultMatch = responseText.match(/<EtiquetaEnvioResult>([\s\S]*?)<\/EtiquetaEnvioResult>/);
  if (resultMatch?.[1]) {
    // Might be wrapped in more XML; extract base64
    const innerBase64 = resultMatch[1].match(/<base64Binary>([\s\S]*?)<\/base64Binary>/);
    return innerBase64?.[1]?.trim() ?? resultMatch[1].trim();
  }

  throw new Error("No label data in EtiquetaEnvio response");
}

/**
 * Cancel a GLS shipment via B2B Anula function.
 */
export async function cancelGLSShipment(
  trackingNumber: string
): Promise<boolean> {
  const uidClient = getUidClient();

  const docIn = `<Servicios uidcliente="${escapeXml(uidClient)}" xmlns="${ASM_NAMESPACE}"><Envio codbarras="${escapeXml(trackingNumber)}"/></Servicios>`;

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <Anula xmlns="${ASM_NAMESPACE}">
      <docIn>${docIn}</docIn>
    </Anula>
  </soap12:Body>
</soap12:Envelope>`;

  console.log("[GLS] Calling Anula for", trackingNumber);

  const response = await proxyFetch(GLS_B2B_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/soap+xml; charset=utf-8",
    },
    body: soapEnvelope,
  });

  if (!response.ok) {
    console.error("[GLS] Anula failed:", response.status);
    return false;
  }

  const text = await response.text();
  console.log("[GLS] Anula response:", text.slice(0, 300));
  return true;
}

// --- Internal helpers ---

function buildGrabaServiciosXml(
  uidClient: string,
  req: GLSShipmentRequest,
  dateStr: string
): string {
  const ref = req.reference ?? `REF-${Date.now()}`;

  return `<Servicios uidcliente="${escapeXml(uidClient)}" xmlns="${ASM_NAMESPACE}">
  <Envio codbarras="">
    <Fecha>${escapeXml(dateStr)}</Fecha>
    <Portes>P</Portes>
    <Servicio>1</Servicio>
    <Horario>2</Horario>
    <Bultos>${req.packages}</Bultos>
    <Peso>${req.weight}</Peso>
    <Volumen></Volumen>
    <Declarado></Declarado>
    <DNINomb>0</DNINomb>
    <FechaPrevistaEntrega></FechaPrevistaEntrega>
    <Retorno>0</Retorno>
    <Pod>N</Pod>
    <PODObligatorio>N</PODObligatorio>
    <Remite>
      <Plaza></Plaza>
      <Nombre>${escapeXml(req.senderName ?? process.env.GLS_SENDER_NAME ?? "Holded2GLS")}</Nombre>
      <Direccion>${escapeXml(req.senderAddress ?? process.env.GLS_SENDER_ADDRESS ?? "")}</Direccion>
      <Poblacion>${escapeXml(req.senderCity ?? process.env.GLS_SENDER_CITY ?? "")}</Poblacion>
      <Provincia></Provincia>
      <Pais>${escapeXml(req.senderCountry ?? process.env.GLS_SENDER_COUNTRY ?? "ES")}</Pais>
      <CP>${escapeXml(req.senderPostalCode ?? process.env.GLS_SENDER_POSTAL_CODE ?? "")}</CP>
      <Telefono>${escapeXml(process.env.GLS_SENDER_PHONE ?? "")}</Telefono>
      <Movil></Movil>
      <Email></Email>
      <Departamento/>
      <NIF/>
      <Observaciones></Observaciones>
    </Remite>
    <Destinatario>
      <Codigo></Codigo>
      <Plaza></Plaza>
      <Nombre>${escapeXml(req.recipientName)}</Nombre>
      <Direccion>${escapeXml(req.recipientAddress)}</Direccion>
      <Poblacion>${escapeXml(req.recipientCity)}</Poblacion>
      <Provincia>${escapeXml(req.recipientProvince ?? "")}</Provincia>
      <Pais>${escapeXml(req.recipientCountry)}</Pais>
      <CP>${escapeXml(req.recipientPostalCode)}</CP>
      <Telefono>${escapeXml(req.recipientPhone ?? "")}</Telefono>
      <Movil></Movil>
      <Email>${escapeXml(req.recipientEmail ?? "")}</Email>
      <Observaciones>${escapeXml(req.notes ?? "")}</Observaciones>
      <ATT></ATT>
      <Departamento></Departamento>
      <NIF/>
    </Destinatario>
    <Referencias>
      <Referencia tipo="C">${escapeXml(ref)}</Referencia>
      <Referencia tipo="0"/>
    </Referencias>
    <Importes>
      <Debido/>
      <Reembolso></Reembolso>
    </Importes>
    <Seguro tipo="0">
      <Descripcion></Descripcion>
      <Importe></Importe>
    </Seguro>
    <DevuelveAdicionales>
      <PlazaDestino/>
      <Etiqueta tipo="PDF"/>
      <EtiquetaDevolucion tipo="PDF"/>
    </DevuelveAdicionales>
    <DevolverDatosASMDestino/>
    <Cliente>
      <Codigo></Codigo>
      <Plaza></Plaza>
      <Agente></Agente>
    </Cliente>
  </Envio>
</Servicios>`;
}

function extractXmlAttribute(
  xml: string,
  tagName: string,
  attrName: string
): string | null {
  const regex = new RegExp(
    `<${tagName}[^>]*\\b${attrName}="([^"]*)"`,
    "i"
  );
  const match = xml.match(regex);
  return match?.[1]?.trim() || null;
}

function extractXmlValue(xml: string, tagName: string): string | null {
  // Case-insensitive tag search
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
  const match = xml.match(regex);
  return match?.[1]?.trim() || null;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
