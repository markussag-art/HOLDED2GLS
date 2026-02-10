const { buildTrackingUrl, GLS_TRACKING_BASES } = require('../../src/services/glsService');

describe('buildTrackingUrl', () => {
  describe('Spain (ES)', () => {
    test('builds correct URL with tracking number and postcode', () => {
      const url = buildTrackingUrl({
        trackingNumber: '1253243472',
        postcode: '10100',
        country: 'ES',
      });
      expect(url).toBe('https://mygls.gls-spain.es/e/1253243472/10100');
    });

    test('strips non-digit characters from postcode', () => {
      const url = buildTrackingUrl({
        trackingNumber: '1253243472',
        postcode: '10-100',
        country: 'ES',
      });
      expect(url).toBe('https://mygls.gls-spain.es/e/1253243472/10100');
    });

    test('normalizes lowercase country to uppercase', () => {
      const url = buildTrackingUrl({
        trackingNumber: '1253243472',
        postcode: '28001',
        country: 'es',
      });
      expect(url).toBe('https://mygls.gls-spain.es/e/1253243472/28001');
    });

    test('throws when postcode is missing for ES', () => {
      expect(() => buildTrackingUrl({
        trackingNumber: '1253243472',
        postcode: '',
        country: 'ES',
      })).toThrow('Missing destination postcode for GLS Spain tracking.');
    });

    test('throws when postcode is null for ES', () => {
      expect(() => buildTrackingUrl({
        trackingNumber: '1253243472',
        postcode: null,
        country: 'ES',
      })).toThrow('Missing destination postcode for GLS Spain tracking.');
    });

    test('throws when tracking number is missing for ES', () => {
      expect(() => buildTrackingUrl({
        trackingNumber: '',
        postcode: '28001',
        country: 'ES',
      })).toThrow('Missing GLS tracking number for tracking URL.');
    });
  });

  describe('Portugal (PT)', () => {
    test('builds correct URL with expedition ID', () => {
      const url = buildTrackingUrl({
        trackingNumber: '9999999',
        postcode: '1000',
        country: 'PT',
        expeditionId: '72f06264-1afb-4275-bb74-384c52ccc846',
      });
      expect(url).toBe('https://mygls.gls-spain.es/expedition/72f06264-1afb-4275-bb74-384c52ccc846');
    });

    test('does not require tracking number for PT', () => {
      const url = buildTrackingUrl({
        trackingNumber: '',
        postcode: '',
        country: 'PT',
        expeditionId: '72f06264-1afb-4275-bb74-384c52ccc846',
      });
      expect(url).toBe('https://mygls.gls-spain.es/expedition/72f06264-1afb-4275-bb74-384c52ccc846');
    });

    test('throws when expedition ID is missing for PT', () => {
      expect(() => buildTrackingUrl({
        trackingNumber: '9999999',
        postcode: '1000',
        country: 'PT',
        expeditionId: '',
      })).toThrow('Missing GLS expedition ID for Portugal tracking.');
    });

    test('throws when expedition ID is undefined for PT', () => {
      expect(() => buildTrackingUrl({
        trackingNumber: '9999999',
        postcode: '1000',
        country: 'PT',
      })).toThrow('Missing GLS expedition ID for Portugal tracking.');
    });
  });

  describe('Other countries', () => {
    test('falls back to ES format when postcode is available', () => {
      const url = buildTrackingUrl({
        trackingNumber: '5555555',
        postcode: '75001',
        country: 'FR',
      });
      expect(url).toBe('https://mygls.gls-spain.es/e/5555555/75001');
    });

    test('throws when no postcode for unknown country', () => {
      expect(() => buildTrackingUrl({
        trackingNumber: '5555555',
        postcode: '',
        country: 'FR',
      })).toThrow('Cannot build tracking URL for country "FR" without postcode');
    });

    test('handles Andorra with postcode', () => {
      const url = buildTrackingUrl({
        trackingNumber: '8888888',
        postcode: 'AD500',
        country: 'AD',
      });
      // AD500 → digits only = 500
      expect(url).toBe('https://mygls.gls-spain.es/e/8888888/500');
    });
  });

  describe('Edge cases', () => {
    test('handles country with whitespace', () => {
      const url = buildTrackingUrl({
        trackingNumber: '1253243472',
        postcode: '10100',
        country: ' ES ',
      });
      expect(url).toBe('https://mygls.gls-spain.es/e/1253243472/10100');
    });

    test('handles null country (falls through to non-ES/PT path)', () => {
      expect(() => buildTrackingUrl({
        trackingNumber: '123',
        postcode: '',
        country: null,
      })).toThrow();
    });
  });
});
