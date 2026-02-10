/**
 * Integration test: Validates the full GLS payload generation for each shipping method.
 * Uses a mock SOAP layer — does not make real GLS API calls.
 */
const { buildGlsPayload } = require('../../src/services/glsService');
const { SHIPPING_METHODS } = require('../../src/config/gls');

describe('GLS Shipment Integration (Mock SOAP)', () => {
  const makeShipment = (methodKey, overrides = {}) => ({
    recipientName: 'Distribuciones García SL',
    recipientCommercialName: 'SuperTienda García',
    recipientAddress: 'Avda. de la Constitución 15',
    recipientCity: 'Palma de Mallorca',
    recipientPostalCode: '07001',
    recipientProvince: 'Baleares',
    recipientCountry: 'ES',
    recipientPhone: '671234567',
    recipientEmail: 'garcia@supertienda.es',
    senderName: 'Yogufruta SCP',
    senderAddress: 'C/ LA SELVA, 26 1º-2',
    senderCity: 'Blanes',
    senderPostalCode: '17300',
    senderCountry: 'ES',
    senderCif: 'J65549842',
    senderPhone: '',
    senderEmail: '',
    shippingMethod: methodKey,
    holdedWaybillNumber: 'A250029',
    deliveryMorning: false,
    deliveryAfternoon: false,
    deliveryNotes: '',
    weight: 3.0,
    packages: 1,
    ...overrides,
  });

  describe.each(SHIPPING_METHODS)('Shipping method: $key ($label)', (method) => {
    let payload;

    beforeAll(() => {
      payload = buildGlsPayload(makeShipment(method.key));
    });

    test('uses correct GLS service code', () => {
      expect(payload.Servicio).toBe(method.glsServiceCode);
    });

    test('sender is Yogufruta SCP', () => {
      expect(payload.Remite_Nombre).toBe('Yogufruta SCP');
      expect(payload.Remite_Direccion).toBe('C/ LA SELVA, 26 1º-2');
      expect(payload.Remite_Poblacion).toBe('Blanes');
      expect(payload.Remite_CP).toBe('17300');
      expect(payload.Remite_NIF).toBe('J65549842');
    });

    test('reference includes Holded waybill formatted as "Ref. Cli. Albaran <NUMBER>"', () => {
      expect(payload.Referencia).toBe('Ref. Cli. Albaran A250029');
    });

    test('only commercial name appears on label, Nombre2 is empty', () => {
      expect(payload.Nombre).toBe('SuperTienda García');
      expect(payload.Nombre2).toBe('');
    });
  });

  test('morning delivery note appears in observations', () => {
    const payload = buildGlsPayload(makeShipment('NATIONAL_STANDARD', {
      deliveryMorning: true,
      deliveryAfternoon: false,
    }));
    expect(payload.Observaciones).toContain('Entregar por la mañana');
    expect(payload.Observaciones).not.toContain('Entregar por la tarde');
  });

  test('afternoon delivery note appears in observations', () => {
    const payload = buildGlsPayload(makeShipment('NATIONAL_STANDARD', {
      deliveryMorning: false,
      deliveryAfternoon: true,
    }));
    expect(payload.Observaciones).toContain('Entregar por la tarde');
    expect(payload.Observaciones).not.toContain('Entregar por la mañana');
  });

  test('both morning and afternoon notes appear in observations', () => {
    const payload = buildGlsPayload(makeShipment('NATIONAL_STANDARD', {
      deliveryMorning: true,
      deliveryAfternoon: true,
    }));
    expect(payload.Observaciones).toContain('Entregar por la mañana');
    expect(payload.Observaciones).toContain('Entregar por la tarde');
  });

  test('NATIONAL_STANDARD has schedule 19:00', () => {
    const payload = buildGlsPayload(makeShipment('NATIONAL_STANDARD'));
    expect(payload.Horario).toBe('19:00');
  });

  test('BALEARIC_ECONOMY has no schedule', () => {
    const payload = buildGlsPayload(makeShipment('BALEARIC_ECONOMY'));
    expect(payload.Horario).toBe('');
  });

  test('INTERNATIONAL has no schedule', () => {
    const payload = buildGlsPayload(makeShipment('INTERNATIONAL'));
    expect(payload.Horario).toBe('');
  });

  test('payment type is prepaid', () => {
    const payload = buildGlsPayload(makeShipment('NATIONAL_STANDARD'));
    expect(payload.Portes).toBe('P');
  });
});
