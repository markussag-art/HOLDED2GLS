import { Router, Request, Response } from 'express';
import * as repo from '../models/shipmentRepository';
import * as service from '../services/shipmentService';
import { SHIPPING_METHODS } from '../models/shipment';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

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

// ── Config info (sender defaults, shipping methods) ──────────────

router.get('/config', (_req: Request, res: Response) => {
  res.json({
    sender: config.sender,
    shippingMethods: SHIPPING_METHODS,
    holdedSentStageId: config.holdedSentStageId,
  });
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

// ── Bulk generate labels ─────────────────────────────────────────

router.post('/shipments/bulk-generate', async (req: Request, res: Response) => {
  try {
    const { shipmentIds } = req.body;
    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
      return res.status(400).json({ error: 'shipmentIds array required' });
    }
    const results = await service.generateLabelsBulk(shipmentIds);
    res.json({ results });
  } catch (err: any) {
    logger.error('POST /bulk-generate failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Update shipment params ───────────────────────────────────────

router.put('/shipments/:id/params', (req: Request, res: Response) => {
  try {
    const shipment = service.updateShipmentParams(req.params.id, req.body);
    res.json(shipment);
  } catch (err: any) {
    logger.error('PUT /shipments/:id/params failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Preflight check ──────────────────────────────────────────────

router.get('/shipments/:id/preflight', (req: Request, res: Response) => {
  try {
    const issues = service.preflightCheck(req.params.id);
    res.json({ ok: issues.length === 0, issues });
  } catch (err: any) {
    logger.error('GET /preflight failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Generate label ───────────────────────────────────────────────

router.post('/shipments/:id/generate-label', async (req: Request, res: Response) => {
  try {
    const result = await service.generateLabel(req.params.id);
    res.json(result);
  } catch (err: any) {
    logger.error('POST /shipments/:id/generate-label failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Regenerate label ─────────────────────────────────────────────

router.post('/shipments/:id/regenerate-label', async (req: Request, res: Response) => {
  try {
    const result = await service.regenerateLabel(req.params.id);
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
  try { res.json(await service.retryHoldedTrackingSync(req.params.id)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/shipments/:id/retry-custom-field-sync', async (req: Request, res: Response) => {
  try { res.json(await service.retryHoldedCustomFieldSync(req.params.id)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/shipments/:id/retry-stage-sync', async (req: Request, res: Response) => {
  try { res.json(await service.retryHoldedStageSync(req.params.id)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/shipments/:id/retry-all-sync', async (req: Request, res: Response) => {
  try { res.json(await service.retryAllHoldedSync(req.params.id)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
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
