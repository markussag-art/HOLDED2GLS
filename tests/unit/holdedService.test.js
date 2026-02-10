const { extractShipmentData } = require('../../src/services/holdedService');

describe('Holded Service - extractShipmentData', () => {
  const mockWaybill = {
    id: 'doc123',
    docNumber: 'A250029',
    contactId: 'contact456',
    contactName: 'Legal Name SL',
    shippingAddress: {
      address: 'Calle Mayor 10',
      city: 'Madrid',
      postalCode: '28001',
      province: 'Madrid',
      country: 'ES',
    },
  };

  const mockContact = {
    name: 'Legal Name SL',
    tradeName: 'TiendaTop',
    email: 'info@tiendatop.com',
    phone: '600123456',
    mobile: '699999999',
  };

  test('extracts holdedDocId from waybill', () => {
    const data = extractShipmentData(mockWaybill, mockContact);
    expect(data.holdedDocId).toBe('doc123');
  });

  test('extracts holdedWaybillNumber from docNumber', () => {
    const data = extractShipmentData(mockWaybill, mockContact);
    expect(data.holdedWaybillNumber).toBe('A250029');
  });

  test('extracts recipientName from contact.name', () => {
    const data = extractShipmentData(mockWaybill, mockContact);
    expect(data.recipientName).toBe('Legal Name SL');
  });

  test('extracts recipientCommercialName from contact.tradeName', () => {
    const data = extractShipmentData(mockWaybill, mockContact);
    expect(data.recipientCommercialName).toBe('TiendaTop');
  });

  test('falls back to waybill contactName when no contact', () => {
    const data = extractShipmentData(mockWaybill, null);
    expect(data.recipientName).toBe('Legal Name SL');
    expect(data.recipientCommercialName).toBe('');
  });

  test('extracts shipping address correctly', () => {
    const data = extractShipmentData(mockWaybill, mockContact);
    expect(data.recipientAddress).toBe('Calle Mayor 10');
    expect(data.recipientCity).toBe('Madrid');
    expect(data.recipientPostalCode).toBe('28001');
    expect(data.recipientProvince).toBe('Madrid');
    expect(data.recipientCountry).toBe('ES');
  });

  test('extracts phone from contact', () => {
    const data = extractShipmentData(mockWaybill, mockContact);
    expect(data.recipientPhone).toBe('600123456');
  });

  test('falls back to mobile when no phone', () => {
    const contactNoPhone = { ...mockContact, phone: '' };
    const data = extractShipmentData(mockWaybill, contactNoPhone);
    expect(data.recipientPhone).toBe('699999999');
  });
});
