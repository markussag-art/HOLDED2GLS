const { SENDER_DEFAULTS } = require('../../src/config/defaults');

describe('Sender Defaults', () => {
  test('default sender name is Yogufruta SCP', () => {
    expect(SENDER_DEFAULTS.name).toBe('Yogufruta SCP');
  });

  test('default sender address is C/ LA SELVA, 26 1º-2', () => {
    expect(SENDER_DEFAULTS.address).toBe('C/ LA SELVA, 26 1º-2');
  });

  test('default sender city is Blanes', () => {
    expect(SENDER_DEFAULTS.city).toBe('Blanes');
  });

  test('default sender CIF is J65549842', () => {
    expect(SENDER_DEFAULTS.cif).toBe('J65549842');
  });

  test('default sender postal code is 17300', () => {
    expect(SENDER_DEFAULTS.postalCode).toBe('17300');
  });

  test('default sender country is ES', () => {
    expect(SENDER_DEFAULTS.country).toBe('ES');
  });
});
