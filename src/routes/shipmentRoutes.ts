import { Router, Request, Response } from 'express';
import * as repo from '../models/shipmentRepository';
import * as service from '../services/shipmentService';
import { logger } from '../utils/logger';

const router = Router();

// ── List all shipments ───────────────────────────────────────────

router.get('/shipments', (_req: Request, res: Response) => {
  try {
    const shipments = repo.getAllShipments();
    res.json(shipments);
  } catch (err: any) {
    logger.error('GET /shipments failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Get single shipment ──────────────────────────────────────────

router.get('/shipments/:id', (req: Request, res: Response) => {
  try {
    const shipment = repo.getShipmentById(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    res.json(shipment);
  } catch (err: any) {
    logger.error('GET /shipments/:id failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Sync waybills from Holded ────────────────────────────────────

router.post('/shipments/sync', async (_req: Request, res: Response) => {
  try {
    const synced = await service.syncWaybillsFromHolded();
    res.json({ synced: synced.length, shipments: synced });
  } catch (err: any) {
    logger.error('POST /shipments/sync failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Generate label ───────────────────────────────────────────────

router.post('/shipments/:id/generate-label', async (req: Request, res: Response) => {
  try {
    const shipment = repo.getShipmentById(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });

    // Merge stored shipment data with any overrides from body
    const input: service.LabelGenerationInput = {
      holdedDocumentId: shipment.holdedDocumentId,
      holdedDocType: shipment.holdedDocType,
      senderName: req.body.senderName || '',
      senderAddress: req.body.senderAddress || '',
      senderCity: req.body.senderCity || '',
      senderPostcode: req.body.senderPostcode || '',
      senderCountry: req.body.senderCountry || 'ES',
      senderPhone: req.body.senderPhone || '',
      recipientName: shipment.recipientName,
      recipientAddress: shipment.recipientAddress,
      recipientCity: shipment.recipientCity,
      recipientPostcode: shipment.recipientPostcode,
      recipientCountry: shipment.recipientCountry,
      recipientPhone: shipment.recipientPhone,
      recipientEmail: shipment.recipientEmail,
      weight: req.body.weight || 1,
      packages: req.body.packages || 1,
      reference: req.body.reference || shipment.holdedDocumentId,
    };

    const result = await service.generateLabel(input);
    res.json(result);
  } catch (err: any) {
    logger.error('POST /shipments/:id/generate-label failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Regenerate label ─────────────────────────────────────────────

router.post('/shipments/:id/regenerate-label', async (req: Request, res: Response) => {
  try {
    const shipment = repo.getShipmentById(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });

    const input: service.LabelGenerationInput = {
      holdedDocumentId: shipment.holdedDocumentId,
      holdedDocType: shipment.holdedDocType,
      senderName: req.body.senderName || '',
      senderAddress: req.body.senderAddress || '',
      senderCity: req.body.senderCity || '',
      senderPostcode: req.body.senderPostcode || '',
      senderCountry: req.body.senderCountry || 'ES',
      senderPhone: req.body.senderPhone || '',
      recipientName: shipment.recipientName,
      recipientAddress: shipment.recipientAddress,
      recipientCity: shipment.recipientCity,
      recipientPostcode: shipment.recipientPostcode,
      recipientCountry: shipment.recipientCountry,
      recipientPhone: shipment.recipientPhone,
      recipientEmail: shipment.recipientEmail,
      weight: req.body.weight || 1,
      packages: req.body.packages || 1,
      reference: req.body.reference || shipment.holdedDocumentId,
    };

    const result = await service.regenerateLabel(input);
    res.json(result);
  } catch (err: any) {
    logger.error('POST /shipments/:id/regenerate-label failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Delete tracking ──────────────────────────────────────────────

router.post('/shipments/:id/delete-tracking', async (req: Request, res: Response) => {
  try {
    const shipment = await service.deleteTracking(req.params.id);
    res.json(shipment);
  } catch (err: any) {
    logger.error('POST /shipments/:id/delete-tracking failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Retry Holded sync ────────────────────────────────────────────

router.post('/shipments/:id/retry-tracking-sync', async (req: Request, res: Response) => {
  try {
    const shipment = await service.retryHoldedTrackingSync(req.params.id);
    res.json(shipment);
  } catch (err: any) {
    logger.error('POST /retry-tracking-sync failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/shipments/:id/retry-custom-field-sync', async (req: Request, res: Response) => {
  try {
    const shipment = await service.retryHoldedCustomFieldSync(req.params.id);
    res.json(shipment);
  } catch (err: any) {
    logger.error('POST /retry-custom-field-sync failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/shipments/:id/retry-stage-sync', async (req: Request, res: Response) => {
  try {
    const shipment = await service.retryHoldedStageSync(req.params.id);
    res.json(shipment);
  } catch (err: any) {
    logger.error('POST /retry-stage-sync failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/shipments/:id/retry-all-sync', async (req: Request, res: Response) => {
  try {
    const result = await service.retryAllHoldedSync(req.params.id);
    res.json(result);
  } catch (err: any) {
    logger.error('POST /retry-all-sync failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Download label PDF ───────────────────────────────────────────

router.get('/shipments/:id/label', (req: Request, res: Response) => {
  try {
    const shipment = repo.getShipmentById(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    if (!shipment.labelPdfPath) return res.status(404).json({ error: 'No label available' });

    const fs = require('fs');
    if (!fs.existsSync(shipment.labelPdfPath)) {
      return res.status(404).json({ error: 'Label file not found on disk' });
    }

    res.download(shipment.labelPdfPath);
  } catch (err: any) {
    logger.error('GET /shipments/:id/label failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

export default router;
