const { buildGlsPayload, buildReferenceString, buildDeliveryNotes, redactPayload } = require('../../src/services/glsService');

describe('GLS Payload Builder', () => {
  const baseShipment = {
    recipientName: 'Legal Name SL',
    recipientCommercialName: 'TiendaTop',
    recipientAddress: 'Calle Mayor 10',
    recipientCity: 'Madrid',
    recipientPostalCode: '28001',
    recipientProvince: 'Madrid',
    recipientCountry: 'ES',
    recipientPhone: '600123456',
    recipientEmail: 'test@example.com',
    senderName: 'Yogufruta SCP',
    senderAddress: 'C/ LA SELVA, 26 1º-2',
    senderCity: 'Blanes',
    senderPostalCode: '17300',
    senderCountry: 'ES',
    senderCif: 'J65549842',
    senderPhone: '',
    senderEmail: '',
    shippingMethod: 'NATIONAL_STANDARD',
    holdedWaybillNumber: 'A250029',
    deliveryMorning: true,
    deliveryAfternoon: false,
    deliveryNotes: '',
    weight: 2.5,
    packages: 1,
  };

  describe('buildReferenceString', () => {
    test('formats waybill number correctly', () => {
      expect(buildReferenceString('A250029')).toBe('Ref. Cli. Albaran A250029');
    });

    test('returns empty string for null', () => {
      expect(buildReferenceString(null)).toBe('');
    });
  });

  describe('buildDeliveryNotes', () => {
    test('returns morning note', () => {
      expect(buildDeliveryNotes(true, false, '')).toBe('Entregar por la mañana');
    });

    test('returns afternoon note', () => {
      expect(buildDeliveryNotes(false, true, '')).toBe('Entregar por la tarde');
    });

    test('returns both notes combined', () => {
      const notes = buildDeliveryNotes(true, true, '');
      expect(notes).toContain('Entregar por la mañana');
      expect(notes).toContain('Entregar por la tarde');
    });

    test('includes extra notes', () => {
      const notes = buildDeliveryNotes(true, false, 'Fragile');
      expect(notes).toContain('Entregar por la mañana');
      expect(notes).toContain('Fragile');
    });
  });

  describe('buildGlsPayload', () => {
    test('sender is always Yogufruta SCP with correct address', () => {
      const payload = buildGlsPayload(baseShipment);
      expect(payload.Remite_Nombre).toBe('Yogufruta SCP');
      expect(payload.Remite_Direccion).toBe('C/ LA SELVA, 26 1º-2');
      expect(payload.Remite_Poblacion).toBe('Blanes');
      expect(payload.Remite_CP).toBe('17300');
      expect(payload.Remite_Pais).toBe('ES');
      expect(payload.Remite_NIF).toBe('J65549842');
    });

    test('recipient commercial name goes to primary Nombre field', () => {
      const payload = buildGlsPayload(baseShipment);
      expect(payload.Nombre).toBe('TiendaTop');
      expect(payload.Nombre2).toBe('Legal Name SL');
    });

    test('when commercial name is same as name, Nombre2 is empty', () => {
      const shipment = { ...baseShipment, recipientCommercialName: 'Legal Name SL' };
      const payload = buildGlsPayload(shipment);
      expect(payload.Nombre).toBe('Legal Name SL');
      expect(payload.Nombre2).toBe('');
    });

    test('when no commercial name, falls back to name', () => {
      const shipment = { ...baseShipment, recipientCommercialName: '' };
      const payload = buildGlsPayload(shipment);
      expect(payload.Nombre).toBe('Legal Name SL');
      expect(payload.Nombre2).toBe('');
    });

    test('reference includes Holded waybill number', () => {
      const payload = buildGlsPayload(baseShipment);
      expect(payload.Referencia).toBe('Ref. Cli. Albaran A250029');
    });

    test('service code is correct for NATIONAL_STANDARD', () => {
      const payload = buildGlsPayload(baseShipment);
      expect(payload.Servicio).toBe('1');
      expect(payload.Horario).toBe('19:00');
    });

    test('service code is correct for BALEARIC_ECONOMY', () => {
      const shipment = { ...baseShipment, shippingMethod: 'BALEARIC_ECONOMY' };
      const payload = buildGlsPayload(shipment);
      expect(payload.Servicio).toBe('74');
    });

    test('service code is correct for INTERNATIONAL', () => {
      const shipment = { ...baseShipment, shippingMethod: 'INTERNATIONAL' };
      const payload = buildGlsPayload(shipment);
      expect(payload.Servicio).toBe('10');
    });

    test('observations include morning delivery note', () => {
      const payload = buildGlsPayload(baseShipment);
      expect(payload.Observaciones).toContain('Entregar por la mañana');
    });

    test('observations include afternoon delivery note', () => {
      const shipment = { ...baseShipment, deliveryMorning: false, deliveryAfternoon: true };
      const payload = buildGlsPayload(shipment);
      expect(payload.Observaciones).toContain('Entregar por la tarde');
    });

    test('throws for unknown shipping method', () => {
      const shipment = { ...baseShipment, shippingMethod: 'INVALID' };
      expect(() => buildGlsPayload(shipment)).toThrow('Unknown shipping method');
    });
  });

  describe('redactPayload', () => {
    test('redacts uidcliente', () => {
      const payload = { uidcliente: 'secret12345', Nombre: 'Test' };
      const redacted = redactPayload(payload);
      expect(redacted.uidcliente).toBe('secr****');
      expect(redacted.Nombre).toBe('Test');
    });
  });
});
