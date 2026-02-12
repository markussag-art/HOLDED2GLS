import * as soap from 'soap';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { SHIPPING_METHODS, ShippingMethod } from '../models/shipment';

/**
 * GLS (ASM) SOAP client for creating shipments and retrieving labels.
 *
 * Uses the B2B WSDL endpoint: https://wsclientes.asmred.com/b2b.asmx?wsdl
 */

export interface GlsShipmentRequest {
  senderName: string;
  senderAddress: string;
  senderCity: string;
  senderPostcode: string;
  senderCountry: string;
  senderPhone: string;
  senderTaxId: string;

  recipientName: string;           // Commercial name preferred on label
  recipientContactName: string;    // Person name
  recipientAddress: string;
  recipientCity: string;
  recipientPostcode: string;
  recipientCountry: string;
  recipientPhone: string;
  recipientEmail: string;

  weight: number;       // kg
  packages: number;
  shippingMethod: ShippingMethod;
  reference: string;    // "Ref. Cli. Albaran <waybillNumber>"
  notes?: string;       // delivery notes
}

export interface GlsShipmentResponse {
  trackingNumber: string;
  expeditionId: string | null;   // present for PT shipments
  labelBase64: string;           // PDF label in base64
  rawResponse: unknown;
}

/**
 * Redact sensitive fields from raw GLS response for safe storage.
 */
export function redactGlsResponse(raw: unknown): string {
  try {
    const snapshot = JSON.parse(JSON.stringify(raw));
    delete snapshot?.uidcliente;
    delete snapshot?.codigo_cliente;
    delete snapshot?.password;
    return JSON.stringify(snapshot);
  } catch {
    return '{"error":"unable to serialize response"}';
  }
}

export class GlsClient {
  private soapClient: soap.Client | null = null;

  async getClient(): Promise<soap.Client> {
    if (this.soapClient) return this.soapClient;

    this.soapClient = await soap.createClientAsync(config.gls.wsdlUrl, {
      wsdl_options: { timeout: 30000 },
    });
    return this.soapClient;
  }

  /**
   * Create a GLS shipment and obtain tracking number + label PDF.
   */
  async createShipment(req: GlsShipmentRequest): Promise<GlsShipmentResponse> {
    const client = await this.getClient();

    // Map shipping method to GLS service code
    const methodDef = SHIPPING_METHODS.find(m => m.code === req.shippingMethod);
    const serviceCode = methodDef?.glsServiceCode || '1';

    const soapBody = {
      GrabarEnvio: {
        uidcliente: config.gls.uid,
        codigo_cliente: config.gls.clientCode,
        // Sender
        plaza_origen: req.senderPostcode,
        nombre_remitente: req.senderName,
        direccion_remitente: req.senderAddress,
        poblacion_remitente: req.senderCity,
        cp_remitente: req.senderPostcode,
        pais_remitente: req.senderCountry,
        telefono_remitente: req.senderPhone,
        nif_remitente: req.senderTaxId,
        // Recipient — commercial name as primary, contact as secondary
        nombre_destinatario: req.recipientName,
        nombre2_destinatario: req.recipientContactName,
        direccion_destinatario: req.recipientAddress,
        poblacion_destinatario: req.recipientCity,
        cp_destinatario: req.recipientPostcode,
        pais_destinatario: req.recipientCountry,
        telefono_destinatario: req.recipientPhone,
        email_destinatario: req.recipientEmail,
        // Package
        peso: req.weight.toString(),
        bultos: req.packages.toString(),
        referencia: req.reference,
        observaciones: req.notes || '',
        // Service
        servicio: serviceCode,
      },
    };

    logger.debug('GLS SOAP createShipment', { reference: req.reference, service: serviceCode });

    try {
      const [result] = await client.GrabarEnvioAsync(soapBody);
      const response = result?.GrabarEnvioResult || result;

      const trackingNumber = this.extractTrackingNumber(response);
      const expeditionId = this.extractExpeditionId(response);
      const labelBase64 = this.extractLabel(response);

      if (!trackingNumber) {
        throw new Error(`GLS did not return a tracking number. Response: ${JSON.stringify(response)}`);
      }

      return {
        trackingNumber,
        expeditionId,
        labelBase64,
        rawResponse: response,
      };
    } catch (err) {
      logger.error('GLS SOAP createShipment failed', { error: err });
      throw err;
    }
  }

  /**
   * Cancel / delete a GLS shipment by tracking number.
   */
  async cancelShipment(trackingNumber: string): Promise<boolean> {
    const client = await this.getClient();

    try {
      const [result] = await client.AnularEnvioAsync({
        AnularEnvio: {
          uidcliente: config.gls.uid,
          codigo_cliente: config.gls.clientCode,
          codigo_barras: trackingNumber,
        },
      });
      logger.info('GLS shipment cancelled', { trackingNumber });
      return true;
    } catch (err) {
      logger.error('GLS cancelShipment failed', { trackingNumber, error: err });
      throw err;
    }
  }

  private extractTrackingNumber(response: any): string {
    return (
      response?.Seguimiento ||
      response?.CodigoBarras ||
      response?.tracking_number ||
      response?.NumeroSeguimiento ||
      ''
    );
  }

  private extractExpeditionId(response: any): string | null {
    return (
      response?.ExpeditionId ||
      response?.expedition_id ||
      response?.UidExpedicion ||
      null
    );
  }

  private extractLabel(response: any): string {
    return (
      response?.Etiqueta ||
      response?.Label ||
      response?.label_base64 ||
      response?.EtiquetaBase64 ||
      ''
    );
  }
}

// Singleton
let instance: GlsClient | null = null;
export function getGlsClient(): GlsClient {
  if (!instance) instance = new GlsClient();
  return instance;
}

export function setGlsClient(client: GlsClient): void {
  instance = client;
}
