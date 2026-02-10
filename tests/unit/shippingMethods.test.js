const { SHIPPING_METHODS, getShippingMethodByKey } = require('../../src/config/gls');

describe('Shipping Methods', () => {
  const REQUIRED_LABELS = [
    'ENTREGA ESTANDAR NACIONAL - COURIER EXPRESS 19:00',
    'ENTREGA ESTANDAR BALEARES - ECONOMY PARCEL2',
    'ENTREGA ESTANDAR INTERNACIONAL',
  ];

  test('exactly 3 shipping methods are defined', () => {
    expect(SHIPPING_METHODS).toHaveLength(3);
  });

  test.each(REQUIRED_LABELS)('contains required label: "%s"', (label) => {
    const found = SHIPPING_METHODS.find((m) => m.label === label);
    expect(found).toBeDefined();
    expect(found.label).toBe(label);
  });

  test('each method has a unique key', () => {
    const keys = SHIPPING_METHODS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('each method has a GLS service code', () => {
    SHIPPING_METHODS.forEach((m) => {
      expect(m.glsServiceCode).toBeTruthy();
    });
  });

  test('NATIONAL_STANDARD maps to service code "1"', () => {
    const method = getShippingMethodByKey('NATIONAL_STANDARD');
    expect(method).toBeDefined();
    expect(method.glsServiceCode).toBe('1');
    expect(method.glsSchedule).toBe('19:00');
  });

  test('BALEARIC_ECONOMY maps to service code "74"', () => {
    const method = getShippingMethodByKey('BALEARIC_ECONOMY');
    expect(method).toBeDefined();
    expect(method.glsServiceCode).toBe('74');
  });

  test('INTERNATIONAL maps to service code "10"', () => {
    const method = getShippingMethodByKey('INTERNATIONAL');
    expect(method).toBeDefined();
    expect(method.glsServiceCode).toBe('10');
  });

  test('getShippingMethodByKey returns null for unknown key', () => {
    expect(getShippingMethodByKey('NONEXISTENT')).toBeNull();
  });
});
