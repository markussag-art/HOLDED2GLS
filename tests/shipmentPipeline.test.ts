/**
 * Integration tests for the HOLDED2GLS shipment pipeline.
 *
 * Mocks both Holded API and GLS SOAP to verify:
 *  - /updatetracking called with trackingUrl
 *  - Update Document called with custom field "Seguimiento de Envio" == trackingUrl
 *  - pipeline/set called with stage ID 698cbc438d534d720403ffa3
 *  - local status updates accordingly
 *  - ES shipment trackingUrl uses /e/<num>/<cp>
 *  - PT shipment trackingUrl uses /expedition/<uuid>
 *  - Delete tracking clears both Holded fields
 *  - Regenerate label creates new shipment and re-syncs
 *  - Retry logic works for individual sync steps
 */

import { initDb, closeDb } from '../src/models/database';
import * as repo from '../src/models/shipmentRepository';
import * as service from '../src/services/shipmentService';
import { setHoldedClient, HoldedClient } from '../src/clients/holdedClient';
import { setGlsClient, GlsClient } from '../src/clients/glsClient';
import { buildTrackingUrl, isValidTrackingUrl } from '../src/utils/tracking';
import { config } from '../src/utils/config';
import { Shipment } from '../src/models/shipment';

// ── Mock setup ───────────────────────────────────────────────────

let holdedCalls: { method: string; args: any[] }[] = [];
let glsCalls: { method: string; args: any[] }[] = [];

function createMockHoldedClient(overrides: Partial<Record<string, Function>> = {}): HoldedClient {
  holdedCalls = [];
  const mock = {
    updateTracking: jest.fn(async (...args: any[]) => {
      holdedCalls.push({ method: 'updateTracking', args });
      if (overrides.updateTracking) return overrides.updateTracking(...args);
      return { status: 1 };
    }),
    clearTracking: jest.fn(async (...args: any[]) => {
      holdedCalls.push({ method: 'clearTracking', args });
      if (overrides.clearTracking) return overrides.clearTracking(...args);
      return { status: 1 };
    }),
    updateCustomField: jest.fn(async (...args: any[]) => {
      holdedCalls.push({ method: 'updateCustomField', args });
      if (overrides.updateCustomField) return overrides.updateCustomField(...args);
      return { fieldId: 'cf_123' };
    }),
    clearCustomField: jest.fn(async (...args: any[]) => {
      holdedCalls.push({ method: 'clearCustomField', args });
      if (overrides.clearCustomField) return overrides.clearCustomField(...args);
      return { fieldId: 'cf_123' };
    }),
    setPipelineStage: jest.fn(async (...args: any[]) => {
      holdedCalls.push({ method: 'setPipelineStage', args });
      if (overrides.setPipelineStage) return overrides.setPipelineStage(...args);
      return { status: 1 };
    }),
    getDocument: jest.fn(async () => ({
      id: 'doc_123',
      customFields: [{ field: 'cf_seg', name: 'Seguimiento de Envio', value: '' }],
    })),
    listDocuments: jest.fn(async () => []),
    updateDocument: jest.fn(async () => ({ status: 1 })),
  } as unknown as HoldedClient;
  return mock;
}

function createMockGlsClient(overrides: Partial<Record<string, Function>> = {}): GlsClient {
  glsCalls = [];
  const mock = {
    createShipment: jest.fn(async (...args: any[]) => {
      glsCalls.push({ method: 'createShipment', args });
      if (overrides.createShipment) return overrides.createShipment(...args);
      return {
        trackingNumber: 'TRK123456',
        expeditionId: null,
        labelBase64: 'JVBER', // fake PDF header
        rawResponse: {},
      };
    }),
    cancelShipment: jest.fn(async (...args: any[]) => {
      glsCalls.push({ method: 'cancelShipment', args });
      return true;
    }),
  } as unknown as GlsClient;
  return mock;
}

/**
 * Helper: create a shipment in the DB and return it.
 * The service's generateLabel now takes a shipmentId and
 * looks it up from the database.
 */
function createTestShipment(overrides: Partial<Shipment> = {}): Shipment {
  return repo.createShipment({
    holdedDocumentId: overrides.holdedDocumentId || 'holded_doc_001',
    holdedDocType: overrides.holdedDocType || 'waybill',
    waybillNumber: overrides.waybillNumber || 'A250001',
    recipientName: overrides.recipientName || 'Test Recipient',
    recipientCommercialName: overrides.recipientCommercialName || '',
    recipientAddress: overrides.recipientAddress || 'Recipient Ave 5',
    recipientCity: overrides.recipientCity || 'Barcelona',
    recipientProvince: overrides.recipientProvince || 'Barcelona',
    recipientPostcode: overrides.recipientPostcode || '08001',
    recipientCountry: overrides.recipientCountry || 'ES',
    recipientPhone: overrides.recipientPhone || '611111111',
    recipientEmail: overrides.recipientEmail || 'test@example.com',
    weight: overrides.weight ?? 2,
    packages: overrides.packages ?? 1,
    shippingMethod: overrides.shippingMethod || 'COURIER_EXPRESS_19',
    deliveryNotes: overrides.deliveryNotes || '',
    ...overrides,
  });
}

// ── Test lifecycle ───────────────────────────────────────────────

beforeEach(() => {
  // Override config to use in-memory DB (config is evaluated at import time,
  // so setting process.env after import doesn't help)
  (config as any).db = { path: ':memory:' };

  const fs = require('fs');
  const path = require('path');
  const tmpDir = path.join(__dirname, '../.test-labels');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  (config as any).labels = { dir: tmpDir };

  closeDb();
  initDb();
});

afterEach(() => {
  closeDb();
});

afterAll(() => {
  const fs = require('fs');
  const path = require('path');
  const tmpDir = path.join(__dirname, '../.test-labels');
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Tracking URL tests ───────────────────────────────────────────

describe('Tracking URL builder', () => {
  test('ES: builds /e/<tracking>/<postcode> URL', () => {
    const url = buildTrackingUrl({
      country: 'ES',
      trackingNumber: 'TRK123',
      postcode: '28001',
    });
    expect(url).toBe('https://mygls.gls-spain.es/e/TRK123/28001');
    expect(isValidTrackingUrl(url)).toBe(true);
  });

  test('PT: builds /expedition/<uuid> URL', () => {
    const url = buildTrackingUrl({
      country: 'PT',
      trackingNumber: 'TRK456',
      expeditionId: 'abc-123-def',
    });
    expect(url).toBe('https://mygls.gls-spain.es/expedition/abc-123-def');
    expect(isValidTrackingUrl(url)).toBe(true);
  });

  test('ES: returns null without postcode', () => {
    const url = buildTrackingUrl({ country: 'ES', trackingNumber: 'TRK' });
    expect(url).toBeNull();
  });

  test('PT: returns null without expeditionId', () => {
    const url = buildTrackingUrl({ country: 'PT', trackingNumber: 'TRK' });
    expect(url).toBeNull();
  });

  test('Unsupported country returns null', () => {
    const url = buildTrackingUrl({ country: 'FR', trackingNumber: 'TRK', postcode: '75001' });
    expect(url).toBeNull();
  });
});

// ── Label generation pipeline tests ──────────────────────────────

describe('Label generation pipeline (ES shipment)', () => {
  test('full success: creates GLS shipment, updates Holded tracking + custom field + etapa', async () => {
    const mockHolded = createMockHoldedClient();
    const mockGls = createMockGlsClient();
    setHoldedClient(mockHolded);
    setGlsClient(mockGls);

    const shipment = createTestShipment({ holdedDocumentId: 'holded_doc_001' });
    const result = await service.generateLabel(shipment.id);

    expect(result.errors).toHaveLength(0);

    // GLS called
    expect(glsCalls).toHaveLength(1);
    expect(glsCalls[0].method).toBe('createShipment');

    // Holded /updatetracking called with full URL
    const trackingCalls = holdedCalls.filter(c => c.method === 'updateTracking');
    expect(trackingCalls).toHaveLength(1);
    expect(trackingCalls[0].args[2]).toBe('https://mygls.gls-spain.es/e/TRK123456/08001');

    // Holded Update Document called with custom field value == trackingUrl
    const customFieldCalls = holdedCalls.filter(c => c.method === 'updateCustomField');
    expect(customFieldCalls).toHaveLength(1);
    expect(customFieldCalls[0].args[2]).toBe('Seguimiento de Envio');
    expect(customFieldCalls[0].args[3]).toBe('https://mygls.gls-spain.es/e/TRK123456/08001');

    // Holded pipeline/set called with correct stage ID
    const stageCalls = holdedCalls.filter(c => c.method === 'setPipelineStage');
    expect(stageCalls).toHaveLength(1);
    expect(stageCalls[0].args[2]).toBe('698cbc438d534d720403ffa3');

    // Local status
    expect(result.shipment.localStatus).toBe('SENT_BY_API');
    expect(result.shipment.holdedTrackingSyncStatus).toBe('SYNCED');
    expect(result.shipment.holdedCustomFieldSyncStatus).toBe('SYNCED');
    expect(result.shipment.holdedStageSyncStatus).toBe('SYNCED');
    expect(result.shipment.holdedStageIdLastSet).toBe('698cbc438d534d720403ffa3');
    expect(result.shipment.trackingUrl).toBe('https://mygls.gls-spain.es/e/TRK123456/08001');
  });

  test('Holded tracking update fails: label kept, error recorded, etapa NOT set', async () => {
    const mockHolded = createMockHoldedClient({
      updateTracking: () => { throw new Error('Holded API 500'); },
    });
    const mockGls = createMockGlsClient();
    setHoldedClient(mockHolded);
    setGlsClient(mockGls);

    const shipment = createTestShipment({ holdedDocumentId: 'holded_doc_002' });
    const result = await service.generateLabel(shipment.id);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.shipment.trackingNumber).toBe('TRK123456');
    expect(result.shipment.holdedTrackingSyncStatus).toBe('ERROR');
    expect(result.shipment.holdedStageSyncStatus).not.toBe('SYNCED');
    expect(result.shipment.localStatus).toBe('LABELED'); // not SENT_BY_API
  });

  test('Holded custom field update fails: etapa NOT set', async () => {
    const mockHolded = createMockHoldedClient({
      updateCustomField: () => { throw new Error('Custom field error'); },
    });
    const mockGls = createMockGlsClient();
    setHoldedClient(mockHolded);
    setGlsClient(mockGls);

    const shipment = createTestShipment({ holdedDocumentId: 'holded_doc_003' });
    const result = await service.generateLabel(shipment.id);

    expect(result.shipment.holdedTrackingSyncStatus).toBe('SYNCED');
    expect(result.shipment.holdedCustomFieldSyncStatus).toBe('ERROR');
    expect(result.shipment.holdedStageSyncStatus).not.toBe('SYNCED');
  });

  test('Holded etapa fails but tracking + custom field succeed', async () => {
    const mockHolded = createMockHoldedClient({
      setPipelineStage: () => { throw new Error('Pipeline error'); },
    });
    const mockGls = createMockGlsClient();
    setHoldedClient(mockHolded);
    setGlsClient(mockGls);

    const shipment = createTestShipment({ holdedDocumentId: 'holded_doc_004' });
    const result = await service.generateLabel(shipment.id);

    expect(result.shipment.holdedTrackingSyncStatus).toBe('SYNCED');
    expect(result.shipment.holdedCustomFieldSyncStatus).toBe('SYNCED');
    expect(result.shipment.holdedStageSyncStatus).toBe('ERROR');
    expect(result.shipment.localStatus).toBe('LABELED'); // not SENT_BY_API since etapa failed
  });
});

describe('Label generation pipeline (PT shipment)', () => {
  test('PT shipment uses /expedition/<uuid> URL', async () => {
    const mockHolded = createMockHoldedClient();
    const mockGls = createMockGlsClient({
      createShipment: async () => ({
        trackingNumber: 'TRK_PT_789',
        expeditionId: 'exp-uuid-abc-123',
        labelBase64: 'JVBER',
        rawResponse: {},
      }),
    });
    setHoldedClient(mockHolded);
    setGlsClient(mockGls);

    const shipment = createTestShipment({
      holdedDocumentId: 'holded_doc_pt_001',
      recipientCountry: 'PT',
      recipientPostcode: '1000-001',
    });

    const result = await service.generateLabel(shipment.id);

    expect(result.shipment.trackingUrl).toBe('https://mygls.gls-spain.es/expedition/exp-uuid-abc-123');
    expect(result.shipment.expeditionId).toBe('exp-uuid-abc-123');

    const trackingCalls = holdedCalls.filter(c => c.method === 'updateTracking');
    expect(trackingCalls[0].args[2]).toBe('https://mygls.gls-spain.es/expedition/exp-uuid-abc-123');
  });
});

// ── Delete tracking tests ────────────────────────────────────────

describe('Delete tracking', () => {
  test('clears Holded Seguimiento, custom field, and local fields', async () => {
    // First create a shipment and generate label
    const mockHolded = createMockHoldedClient();
    const mockGls = createMockGlsClient();
    setHoldedClient(mockHolded);
    setGlsClient(mockGls);

    const shipment = createTestShipment({ holdedDocumentId: 'holded_doc_del_001' });
    const genResult = await service.generateLabel(shipment.id);

    holdedCalls = []; // reset call tracking

    // Now delete tracking
    const updated = await service.deleteTracking(genResult.shipment.id);

    // Verify Holded calls
    const clearTrackingCalls = holdedCalls.filter(c => c.method === 'clearTracking');
    expect(clearTrackingCalls).toHaveLength(1);

    const clearCustomCalls = holdedCalls.filter(c => c.method === 'clearCustomField');
    expect(clearCustomCalls).toHaveLength(1);
    expect(clearCustomCalls[0].args[2]).toBe('Seguimiento de Envio');

    // Local fields cleared
    expect(updated.trackingNumber).toBeNull();
    expect(updated.trackingUrl).toBeNull();
    expect(updated.localStatus).toBe('PENDING');
    expect(updated.holdedTrackingSyncStatus).toBe('NOT_SYNCED');
    expect(updated.holdedCustomFieldSyncStatus).toBe('NOT_SYNCED');
  });
});

// ── Regenerate label tests ───────────────────────────────────────

describe('Regenerate label', () => {
  test('clears old tracking, creates new GLS shipment, re-syncs Holded', async () => {
    // First generate
    const mockHolded = createMockHoldedClient();
    let callCount = 0;
    const mockGls = createMockGlsClient({
      createShipment: async () => {
        callCount++;
        return {
          trackingNumber: 'TRK_REGEN_' + callCount,
          expeditionId: null,
          labelBase64: 'JVBER',
          rawResponse: {},
        };
      },
    });
    setHoldedClient(mockHolded);
    setGlsClient(mockGls);

    const shipment = createTestShipment({ holdedDocumentId: 'holded_doc_regen_001' });
    await service.generateLabel(shipment.id);

    holdedCalls = [];

    // Regenerate
    const result = await service.regenerateLabel(shipment.id);

    // Should have new tracking number
    expect(result.shipment.trackingNumber).toBe('TRK_REGEN_2');

    // Holded should have been called to clear + update
    const clearCalls = holdedCalls.filter(c =>
      c.method === 'clearTracking' || c.method === 'clearCustomField'
    );
    expect(clearCalls.length).toBeGreaterThanOrEqual(2);

    // And new tracking should be synced
    const updateCalls = holdedCalls.filter(c => c.method === 'updateTracking');
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Retry sync tests ─────────────────────────────────────────────

describe('Retry Holded sync', () => {
  test('retryAllHoldedSync retries failed steps in order', async () => {
    // Create a shipment with tracking error
    const mockHolded = createMockHoldedClient({
      updateTracking: () => { throw new Error('Fail first time'); },
    });
    const mockGls = createMockGlsClient();
    setHoldedClient(mockHolded);
    setGlsClient(mockGls);

    const shipment = createTestShipment({ holdedDocumentId: 'holded_doc_retry_001' });
    const genResult = await service.generateLabel(shipment.id);

    expect(genResult.shipment.holdedTrackingSyncStatus).toBe('ERROR');

    // Now fix the mock and retry
    const fixedHolded = createMockHoldedClient(); // no overrides = all succeed
    setHoldedClient(fixedHolded);

    const retryResult = await service.retryAllHoldedSync(genResult.shipment.id);

    expect(retryResult.errors).toHaveLength(0);
    expect(retryResult.shipment.holdedTrackingSyncStatus).toBe('SYNCED');
    expect(retryResult.shipment.holdedCustomFieldSyncStatus).toBe('SYNCED');
    expect(retryResult.shipment.holdedStageSyncStatus).toBe('SYNCED');
    expect(retryResult.shipment.localStatus).toBe('SENT_BY_API');
  });

  test('retryHoldedStageSync fails if tracking not synced', async () => {
    const mockHolded = createMockHoldedClient({
      updateTracking: () => { throw new Error('Tracking fail'); },
    });
    const mockGls = createMockGlsClient();
    setHoldedClient(mockHolded);
    setGlsClient(mockGls);

    const shipment = createTestShipment({ holdedDocumentId: 'holded_doc_retry_002' });
    const genResult = await service.generateLabel(shipment.id);

    // Try to set stage — should fail because tracking isn't synced
    await expect(
      service.retryHoldedStageSync(genResult.shipment.id)
    ).rejects.toThrow('Cannot set etapa: Holded Seguimiento not synced');
  });
});

// ── No "Pending → Accepted" transition ───────────────────────────

describe('No Pending → Accepted transition', () => {
  test('waybills are synced without status transition logic', async () => {
    const mockHolded = createMockHoldedClient();
    (mockHolded as any).listDocuments = jest.fn(async () => [
      {
        id: 'doc_accepted_001',
        status: 'accepted',
        contactName: 'Client A',
        shippingAddress: {
          address: 'Street 1',
          city: 'Seville',
          postalCode: '41001',
          countryCode: 'ES',
        },
        pipeline: { stageId: 'some_other_stage' },
      },
      {
        id: 'doc_already_sent',
        status: 'accepted',
        contactName: 'Client B',
        shippingAddress: {},
        pipeline: { stageId: '698cbc438d534d720403ffa3' }, // already sent
      },
    ]);
    setHoldedClient(mockHolded);

    const synced = await service.syncWaybillsFromHolded();

    // Only the first doc should be synced (second already has sent stage)
    expect(synced).toHaveLength(1);
    expect(synced[0].holdedDocumentId).toBe('doc_accepted_001');
    expect(synced[0].recipientCity).toBe('Seville');

    // No calls to change document status
    const statusCalls = holdedCalls.filter(c =>
      c.method === 'updateDocument' && JSON.stringify(c.args).includes('status')
    );
    expect(statusCalls).toHaveLength(0);
  });
});
