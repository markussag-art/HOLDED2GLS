import * as soap from 'soap';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

/**
 * GLS (ASM) SOAP client for creating shipments and retrieving labels.
 *
 * Uses the B2B WSDL endpoint.
 */

export interface GlsShipmentRequest {
  senderName: string;
  senderAddress: string;
  senderCity: string;
  senderPostcode: string;
  senderCountry: string;
  senderPhone: string;

  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  recipientPostcode: string;
  recipientCountry: string;
  recipientPhone: string;
  recipientEmail: string;

  weight: number;       // kg
  packages: number;
  reference: string;    // e.g. waybill number
  notes?: string;
}

export interface GlsShipmentResponse {
  trackingNumber: string;
  expeditionId: string | null;   // present for PT shipments
  labelBase64: string;           // PDF label in base64
  rawResponse: unknown;
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

    const soapBody = {
      GrабarEnvio: {
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
        // Recipient
        nombre_destinatario: req.recipientName,
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
      },
    };

    logger.debug('GLS SOAP createShipment', { reference: req.reference });

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
    // GLS returns tracking number in various fields depending on version
    return (
      response?.Seguimiento ||
      response?.CodigoBarras ||
      response?.tracking_number ||
      response?.NumeroSeguimiento ||
      ''
    );
  }

  private extractExpeditionId(response: any): string | null {
    // For PT shipments, the expedition UUID is returned
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
