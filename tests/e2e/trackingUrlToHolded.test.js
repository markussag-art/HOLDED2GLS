/**
 * E2E Test: Full tracking URL to Holded flow for one shipment.
 *
 * Simulates the complete generate-label pipeline:
 *   1. Create a shipment in a real (isolated) SQLite test DB
 *   2. Call GLS SOAP API (mocked) to generate a label
 *   3. Build the country-dependent tracking URL
 *   4. Sync tracking URL to Holded (mocked HTTP)
 *   5. Verify all DB fields match expected state
 *   6. Verify the Holded API received the correct payload
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

// --- Set up isolated test DB BEFORE any app modules load ---
const testDbPath = path.join(os.tmpdir(), `holded2gls-e2e-${Date.now()}.db`);
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';
process.env.GLS_UID = 'test-uid-1234';
process.env.GLS_CLIENT_CODE = 'test-client';
process.env.GLS_CONTRACT = 'test-contract';
process.env.HOLDED_API_KEY = 'test-holded-key';

// --- Mock soap module (GLS SOAP API) ---
jest.mock('soap', () => ({
  createClientAsync: jest.fn(),
}));

// --- Mock axios module (Holded REST API) ---
jest.mock('axios', () => {
  const mockPost = jest.fn();
  const mockGet = jest.fn();
  const instance = { post: mockPost, get: mockGet };
  return {
    create: jest.fn(() => instance),
    __mockInstance: instance,
  };
});

const soap = require('soap');
const axios = require('axios');

// Now require app modules (after env + mocks are in place)
const { getDb, closeDb } = require('../../src/config/database');
const { runMigrations } = require('../../src/migrations/run');
const ShipmentModel = require('../../src/models/Shipment');
const glsService = require('../../src/services/glsService');
const holdedService = require('../../src/services/holdedService');

describe('E2E: Tracking URL to Holded — Full Flow', () => {
  beforeAll(() => {
    runMigrations();
  });

  afterAll(() => {
    closeDb();
    // Clean up test DB files
    try { fs.unlinkSync(testDbPath); } catch (e) { /* ignore */ }
    try { fs.unlinkSync(testDbPath + '-wal'); } catch (e) { /* ignore */ }
    try { fs.unlinkSync(testDbPath + '-shm'); } catch (e) { /* ignore */ }
  });

  test('Full flow: Create ES shipment → GLS label → Tracking URL → Holded sync', async () => {
    // ========================================================
    // STEP 1: Create a shipment in the test database
    // ========================================================
    const shipmentData = {
      holdedDocId: 'holded-doc-abc123',
      holdedDocNumber: 'A250029',
      holdedWaybillNumber: 'A250029',
      recipientName: 'Frutas García SL',
      recipientCommercialName: 'FrutasGarcía Shop',
      recipientAddress: 'Calle Mayor 10',
      recipientCity: 'Madrid',
      recipientPostalCode: '10100',
      recipientProvince: 'Madrid',
      recipientCountry: 'ES',
      recipientPhone: '612345678',
      recipientEmail: 'garcia@example.com',
      senderName: 'Yogufruta SCP',
      senderAddress: 'C/ LA SELVA, 26 1º-2',
      senderCity: 'Blanes',
      senderPostalCode: '17300',
      senderCountry: 'ES',
      senderCif: 'J65549842',
      senderPhone: '972330000',
      senderEmail: 'info@yogufruta.com',
      shippingMethod: 'NATIONAL_STANDARD',
      glsServiceCode: '1',
      deliveryMorning: true,
      deliveryAfternoon: false,
      deliveryNotes: 'Fragile',
      weight: 2.5,
      packages: 1,
      status: 'PENDING',
    };

    const shipment = ShipmentModel.create(shipmentData);
    expect(shipment).toBeTruthy();
    expect(shipment.id).toBeDefined();
    expect(shipment.status).toBe('PENDING');
    expect(shipment.holded_doc_id).toBe('holded-doc-abc123');
    expect(shipment.holded_waybill_number).toBe('A250029');
    expect(shipment.tracking_url).toBeNull();
    expect(shipment.holded_tracking_sync_status).toBe('NOT_SYNCED');
    console.log(`  [1/9] Shipment created in DB with id=${shipment.id}, status=PENDING`);

    // ========================================================
    // STEP 2: Set up GLS SOAP mock to return a tracking number
    // ========================================================
    const mockGlsResponse = {
      GrabarEnvioResult: {
        Expedicion: '1253243472',
        NumeroEnvio: '1253243472',
        CodigoBarras: '1253243472',
        Etiqueta: 'JVBERi0xLjcNCjEgMCBvYmoNCjw8IC9UeXBlIC9DYXRhbG9nDQo+Pg==',
      },
    };
    const mockSoapClient = {
      GrabarEnvioAsync: jest.fn().mockResolvedValue([mockGlsResponse]),
    };
    soap.createClientAsync.mockResolvedValue(mockSoapClient);
    console.log('  [2/9] GLS SOAP mock configured (tracking=1253243472)');

    // ========================================================
    // STEP 3: Set up Holded API mock to accept updatetracking
    // ========================================================
    const holdedMock = axios.__mockInstance;
    holdedMock.post.mockResolvedValue({
      data: { status: 1, info: 'Tracking updated successfully' },
    });
    console.log('  [3/9] Holded API mock configured');

    // ========================================================
    // STEP 4: Call GLS createShipment (SOAP) — generates label
    // ========================================================
    const dbShipment = ShipmentModel.findById(shipment.id);
    const result = await glsService.createShipment(dbShipment);

    expect(result.success).toBe(true);
    expect(result.trackingNumber).toBe('1253243472');
    expect(result.expeditionId).toBe('');
    expect(result.labelBase64).toBe('JVBERi0xLjcNCjEgMCBvYmoNCjw8IC9UeXBlIC9DYXRhbG9nDQo+Pg==');
    console.log(`  [4/9] GLS label generated: tracking=${result.trackingNumber}`);

    // Verify GLS SOAP was called with correct payload
    expect(mockSoapClient.GrabarEnvioAsync).toHaveBeenCalledTimes(1);
    const soapPayload = mockSoapClient.GrabarEnvioAsync.mock.calls[0][0].Ession;
    expect(soapPayload.Servicio).toBe('1');
    expect(soapPayload.Nombre).toBe('FrutasGarcía Shop');
    expect(soapPayload.Nombre2).toBe('Frutas García SL');
    expect(soapPayload.Referencia).toBe('Ref. Cli. Albaran A250029');
    expect(soapPayload.Observaciones).toContain('Entregar por la mañana');
    expect(soapPayload.Observaciones).toContain('Fragile');
    expect(soapPayload.Remite_Nombre).toBe('Yogufruta SCP');
    expect(soapPayload.Remite_Direccion).toBe('C/ LA SELVA, 26 1º-2');
    expect(soapPayload.Remite_CP).toBe('17300');
    expect(soapPayload.Remite_NIF).toBe('J65549842');
    expect(soapPayload.CP).toBe('10100');
    expect(soapPayload.Pais).toBe('ES');
    console.log('  [5/9] GLS SOAP payload verified (service, names, reference, sender, observations)');

    // ========================================================
    // STEP 5: Build tracking URL (ES format)
    // ========================================================
    const trackingUrl = glsService.buildTrackingUrl({
      trackingNumber: result.trackingNumber,
      postcode: dbShipment.recipient_postal_code,
      country: dbShipment.recipient_country,
      expeditionId: result.expeditionId,
    });
    expect(trackingUrl).toBe('https://mygls.gls-spain.es/e/1253243472/10100');
    console.log(`  [6/9] Tracking URL built: ${trackingUrl}`);

    // ========================================================
    // STEP 6: Save GLS result to DB (as the route handler does)
    // ========================================================
    ShipmentModel.updateGlsResult(shipment.id, {
      trackingNumber: result.trackingNumber,
      expeditionId: result.expeditionId,
      labelData: result.labelBase64,
      trackingUrl,
      requestPayload: result.requestPayload,
      responsePayload: result.rawResponse,
      status: 'LABEL_GENERATED',
    });

    const afterGls = ShipmentModel.findById(shipment.id);
    expect(afterGls.status).toBe('LABEL_GENERATED');
    expect(afterGls.gls_tracking_number).toBe('1253243472');
    expect(afterGls.tracking_url).toBe('https://mygls.gls-spain.es/e/1253243472/10100');
    expect(afterGls.gls_label_data).toBeTruthy();
    console.log('  [7/9] GLS result saved to DB (status=LABEL_GENERATED)');

    // ========================================================
    // STEP 7: Sync tracking URL to Holded via updateTracking
    // ========================================================
    const syncResult = await holdedService.updateTracking(
      'waybill',
      dbShipment.holded_doc_id,
      { trackingNumber: result.trackingNumber, trackingUrl },
    );
    expect(syncResult.success).toBe(true);

    // Verify Holded API received the correct URL and endpoint
    expect(holdedMock.post).toHaveBeenCalledWith(
      '/documents/waybill/holded-doc-abc123/updatetracking',
      {
        tracking: 'https://mygls.gls-spain.es/e/1253243472/10100',
        trackingNumber: '1253243472',
      },
    );
    console.log('  [8/9] Holded updatetracking called with correct payload');

    // Save Holded sync status to DB
    ShipmentModel.updateHoldedTrackingSync(shipment.id, {
      syncStatus: 'SYNCED',
      payload: syncResult.payload,
    });

    // ========================================================
    // STEP 8: Verify final DB state — all fields correct
    // ========================================================
    const final = ShipmentModel.findById(shipment.id);

    // Shipment status
    expect(final.status).toBe('LABEL_GENERATED');

    // GLS tracking data
    expect(final.gls_tracking_number).toBe('1253243472');
    expect(final.tracking_url).toBe('https://mygls.gls-spain.es/e/1253243472/10100');
    expect(final.gls_label_data).toBe('JVBERi0xLjcNCjEgMCBvYmoNCjw8IC9UeXBlIC9DYXRhbG9nDQo+Pg==');

    // Holded sync
    expect(final.holded_tracking_sync_status).toBe('SYNCED');
    expect(final.holded_tracking_payload).toBeTruthy();
    const savedPayload = JSON.parse(final.holded_tracking_payload);
    expect(savedPayload.tracking).toBe('https://mygls.gls-spain.es/e/1253243472/10100');
    expect(savedPayload.trackingNumber).toBe('1253243472');

    // GLS request/response payloads stored for debug
    expect(final.gls_request_payload).toBeTruthy();
    expect(final.gls_response_payload).toBeTruthy();

    // Original shipment data preserved
    expect(final.holded_doc_id).toBe('holded-doc-abc123');
    expect(final.holded_waybill_number).toBe('A250029');
    expect(final.recipient_name).toBe('Frutas García SL');
    expect(final.recipient_commercial_name).toBe('FrutasGarcía Shop');
    expect(final.recipient_postal_code).toBe('10100');
    expect(final.recipient_country).toBe('ES');
    expect(final.sender_name).toBe('Yogufruta SCP');
    expect(final.sender_cif).toBe('J65549842');

    console.log('  [9/9] Final DB state verified:');
    console.log(`    status:              ${final.status}`);
    console.log(`    tracking_number:     ${final.gls_tracking_number}`);
    console.log(`    tracking_url:        ${final.tracking_url}`);
    console.log(`    holded_sync_status:  ${final.holded_tracking_sync_status}`);
    console.log(`    holded_payload:      ${final.holded_tracking_payload}`);
    console.log(`    label_data:          ${final.gls_label_data ? '(present, ' + final.gls_label_data.length + ' chars)' : '(missing)'}`);
    console.log(`    gls_request_payload: (present)`);
    console.log(`    gls_response_payload: (present)`);
    console.log('\n  END-TO-END TEST PASSED: ES shipment tracking URL synced to Holded');
  });
});
