/**
 * Integration test: Validates the tracking URL build + Holded sync payload flow.
 * Uses mock data — does not make real API calls.
 */
const { buildTrackingUrl, buildGlsPayload, extractGlsResponseData } = require('../../src/services/glsService');

describe('Holded Tracking Sync Integration (Mock)', () => {
  describe('After label generation — ES shipment', () => {
    const mockGlsResponse = {
      Expedicion: '1253243472',
      NumeroEnvio: '1253243472',
      Etiqueta: 'base64labeldata==',
    };

    const shipment = {
      recipientName: 'Test SL',
      recipientCommercialName: 'TestShop',
      recipientAddress: 'Calle Test 1',
      recipientCity: 'Madrid',
      recipientPostalCode: '28001',
      recipientProvince: 'Madrid',
      recipientCountry: 'ES',
      recipientPhone: '600000000',
      recipientEmail: 'test@test.com',
      senderName: 'Yogufruta SCP',
      senderAddress: 'C/ LA SELVA, 26 1º-2',
      senderCity: 'Blanes',
      senderPostalCode: '17300',
      senderCountry: 'ES',
      senderCif: 'J65549842',
      shippingMethod: 'NATIONAL_STANDARD',
      holdedWaybillNumber: 'A250029',
      deliveryMorning: false,
      deliveryAfternoon: false,
      weight: 1,
      packages: 1,
    };

    test('extractGlsResponseData extracts trackingNumber', () => {
      const data = extractGlsResponseData(mockGlsResponse);
      expect(data.trackingNumber).toBe('1253243472');
      expect(data.labelBase64).toBe('base64labeldata==');
    });

    test('buildTrackingUrl produces correct ES URL from extracted data', () => {
      const data = extractGlsResponseData(mockGlsResponse);
      const url = buildTrackingUrl({
        trackingNumber: data.trackingNumber,
        postcode: shipment.recipientPostalCode,
        country: shipment.recipientCountry,
        expeditionId: data.expeditionId,
      });
      expect(url).toBe('https://mygls.gls-spain.es/e/1253243472/28001');
    });

    test('Holded updatetracking payload would contain the full tracking URL', () => {
      const data = extractGlsResponseData(mockGlsResponse);
      const trackingUrl = buildTrackingUrl({
        trackingNumber: data.trackingNumber,
        postcode: shipment.recipientPostalCode,
        country: shipment.recipientCountry,
        expeditionId: data.expeditionId,
      });

      // Simulate the payload that would be sent to Holded
      const holdedPayload = {
        tracking: trackingUrl,
        trackingNumber: data.trackingNumber,
      };

      expect(holdedPayload.tracking).toBe('https://mygls.gls-spain.es/e/1253243472/28001');
      expect(holdedPayload.trackingNumber).toBe('1253243472');
    });
  });

  describe('After label generation — PT shipment', () => {
    const mockGlsResponsePT = {
      Expedicion: '9876543210',
      ExpedicionUUID: '72f06264-1afb-4275-bb74-384c52ccc846',
      Etiqueta: 'base64ptlabel==',
    };

    test('extractGlsResponseData extracts expeditionId for PT', () => {
      const data = extractGlsResponseData(mockGlsResponsePT);
      expect(data.trackingNumber).toBe('9876543210');
      expect(data.expeditionId).toBe('72f06264-1afb-4275-bb74-384c52ccc846');
    });

    test('buildTrackingUrl produces correct PT URL from extracted data', () => {
      const data = extractGlsResponseData(mockGlsResponsePT);
      const url = buildTrackingUrl({
        trackingNumber: data.trackingNumber,
        postcode: '1000',
        country: 'PT',
        expeditionId: data.expeditionId,
      });
      expect(url).toBe('https://mygls.gls-spain.es/expedition/72f06264-1afb-4275-bb74-384c52ccc846');
    });

    test('Holded updatetracking payload for PT contains expedition URL', () => {
      const data = extractGlsResponseData(mockGlsResponsePT);
      const trackingUrl = buildTrackingUrl({
        trackingNumber: data.trackingNumber,
        postcode: '1000',
        country: 'PT',
        expeditionId: data.expeditionId,
      });

      const holdedPayload = {
        tracking: trackingUrl,
        trackingNumber: data.trackingNumber,
      };

      expect(holdedPayload.tracking).toBe('https://mygls.gls-spain.es/expedition/72f06264-1afb-4275-bb74-384c52ccc846');
    });
  });

  describe('Delete tracking flow', () => {
    test('clear tracking payload has empty strings', () => {
      const clearPayload = {
        tracking: '',
        trackingNumber: '',
      };
      expect(clearPayload.tracking).toBe('');
      expect(clearPayload.trackingNumber).toBe('');
    });
  });

  describe('Regenerate flow', () => {
    test('new tracking URL replaces old one after regeneration', () => {
      // Simulate: old label had tracking 111, new label has tracking 222
      const oldUrl = buildTrackingUrl({
        trackingNumber: '1110000000',
        postcode: '28001',
        country: 'ES',
      });
      const newUrl = buildTrackingUrl({
        trackingNumber: '2220000000',
        postcode: '28001',
        country: 'ES',
      });

      expect(oldUrl).not.toBe(newUrl);
      expect(newUrl).toBe('https://mygls.gls-spain.es/e/2220000000/28001');

      // The Holded payload should contain the NEW url
      const holdedPayload = {
        tracking: newUrl,
        trackingNumber: '2220000000',
      };
      expect(holdedPayload.tracking).toContain('2220000000');
    });
  });

  describe('Validation blocks sync', () => {
    test('ES without postcode blocks tracking URL generation', () => {
      expect(() => buildTrackingUrl({
        trackingNumber: '1253243472',
        postcode: '',
        country: 'ES',
      })).toThrow('Missing destination postcode');
    });

    test('PT without expeditionId blocks tracking URL generation', () => {
      expect(() => buildTrackingUrl({
        trackingNumber: '9876543210',
        postcode: '1000',
        country: 'PT',
        expeditionId: '',
      })).toThrow('Missing GLS expedition ID');
    });
  });
});
