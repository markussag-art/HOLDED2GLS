/**
 * GLS Spain SOAP API configuration and shipping method definitions.
 *
 * Service codes are based on the GLS Spain / ASM SOAP API (b2b.asmx).
 * See docs/INTEGRATIONS.md for detailed mapping.
 */

const GLS_CONFIG = {
  wsdlUrl: process.env.GLS_WSDL_URL || 'https://wsclientes.asmred.com/b2b.asmx?wsdl',
  uid: process.env.GLS_UID || '',
  clientCode: process.env.GLS_CLIENT_CODE || '',
  contract: process.env.GLS_CONTRACT || '',
};

/**
 * The 3 required shipping methods mapped to GLS service/product codes.
 *
 * GLS Spain (ASM) uses the following service codes in the SOAP GrabarEnvio call:
 *  - Servicio "1"  + Horario "19:00" → Courier Express 19:00 (national standard)
 *  - Servicio "74" → Economy Parcel (used for Balearic Islands)
 *  - Servicio "10" → EuroBusinessParcel (international standard)
 */
const SHIPPING_METHODS = [
  {
    key: 'NATIONAL_STANDARD',
    label: 'ENTREGA ESTANDAR NACIONAL - COURIER EXPRESS 19:00',
    glsServiceCode: '1',
    glsProductCode: '1',
    glsSchedule: '19:00',
    description: 'Standard national delivery via Courier Express by 19:00',
  },
  {
    key: 'BALEARIC_ECONOMY',
    label: 'ENTREGA ESTANDAR BALEARES - ECONOMY PARCEL2',
    glsServiceCode: '74',
    glsProductCode: '74',
    glsSchedule: '',
    description: 'Economy delivery for Balearic Islands',
  },
  {
    key: 'INTERNATIONAL',
    label: 'ENTREGA ESTANDAR INTERNACIONAL',
    glsServiceCode: '10',
    glsProductCode: '10',
    glsSchedule: '',
    description: 'Standard international delivery via EuroBusinessParcel',
  },
];

/**
 * Delivery window options for notes/observations on the label.
 */
const DELIVERY_WINDOWS = {
  MORNING: 'Entregar por la mañana',
  AFTERNOON: 'Entregar por la tarde',
};

function getShippingMethodByKey(key) {
  return SHIPPING_METHODS.find((m) => m.key === key) || null;
}

function getShippingMethodKeys() {
  return SHIPPING_METHODS.map((m) => m.key);
}

module.exports = {
  GLS_CONFIG,
  SHIPPING_METHODS,
  DELIVERY_WINDOWS,
  getShippingMethodByKey,
  getShippingMethodKeys,
};
