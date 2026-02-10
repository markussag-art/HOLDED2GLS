const express = require('express');
const router = express.Router();
const ShipmentModel = require('../models/Shipment');
const SettingsModel = require('../models/Settings');
const { SHIPPING_METHODS, getShippingMethodByKey } = require('../config/gls');
const { buildGlsPayload, buildTrackingUrl, redactPayload, createShipment } = require('../services/glsService');
const holdedService = require('../services/holdedService');

/**
 * GET /shipments — List all shipments
 */
router.get('/', (req, res) => {
  const shipments = ShipmentModel.findAll();
  res.render('shipments/index', { shipments, shippingMethods: SHIPPING_METHODS });
});

/**
 * GET /shipments/new — New shipment form
 */
router.get('/new', (req, res) => {
  const sender = SettingsModel.getSender();
  res.render('shipments/form', {
    shipment: null,
    sender,
    shippingMethods: SHIPPING_METHODS,
    error: null,
  });
});

/**
 * GET /shipments/import — Import waybill from Holded
 */
router.get('/import', async (req, res) => {
  try {
    const waybills = await holdedService.listWaybills();
    res.render('shipments/import', { waybills, error: null });
  } catch (err) {
    res.render('shipments/import', { waybills: [], error: err.message });
  }
});

/**
 * POST /shipments/import/:docId — Import a specific waybill and pre-fill form
 */
router.post('/import/:docId', async (req, res) => {
  try {
    const waybill = await holdedService.getWaybill(req.params.docId);
    let contact = null;
    if (waybill.contactId) {
      contact = await holdedService.getContact(waybill.contactId);
    }
    const data = holdedService.extractShipmentData(waybill, contact);
    const sender = SettingsModel.getSender();
    res.render('shipments/form', {
      shipment: data,
      sender,
      shippingMethods: SHIPPING_METHODS,
      error: null,
    });
  } catch (err) {
    res.render('shipments/import', { waybills: [], error: err.message });
  }
});

/**
 * POST /shipments — Create shipment (save to DB)
 */
router.post('/', (req, res) => {
  const body = req.body;
  const method = getShippingMethodByKey(body.shippingMethod);

  const data = {
    holdedDocId: body.holdedDocId || '',
    holdedDocNumber: body.holdedDocNumber || '',
    holdedWaybillNumber: body.holdedWaybillNumber || '',
    recipientName: body.recipientName || '',
    recipientCommercialName: body.recipientCommercialName || '',
    recipientAddress: body.recipientAddress || '',
    recipientCity: body.recipientCity || '',
    recipientPostalCode: body.recipientPostalCode || '',
    recipientProvince: body.recipientProvince || '',
    recipientCountry: body.recipientCountry || 'ES',
    recipientPhone: body.recipientPhone || '',
    recipientEmail: body.recipientEmail || '',
    senderName: body.senderName || '',
    senderAddress: body.senderAddress || '',
    senderCity: body.senderCity || '',
    senderPostalCode: body.senderPostalCode || '',
    senderCountry: body.senderCountry || 'ES',
    senderCif: body.senderCif || '',
    senderPhone: body.senderPhone || '',
    senderEmail: body.senderEmail || '',
    shippingMethod: body.shippingMethod || 'NATIONAL_STANDARD',
    glsServiceCode: method ? method.glsServiceCode : '1',
    deliveryMorning: body.deliveryMorning === 'on' || body.deliveryMorning === '1',
    deliveryAfternoon: body.deliveryAfternoon === 'on' || body.deliveryAfternoon === '1',
    deliveryNotes: body.deliveryNotes || '',
    weight: parseFloat(body.weight) || 1.0,
    packages: parseInt(body.packages, 10) || 1,
    status: 'PENDING',
  };

  const shipment = ShipmentModel.create(data);
  res.redirect(`/shipments/${shipment.id}`);
});

/**
 * GET /shipments/:id — View shipment detail + debug panel
 */
router.get('/:id', (req, res) => {
  const shipment = ShipmentModel.findById(req.params.id);
  if (!shipment) return res.status(404).send('Shipment not found');

  // Build a preview of the GLS payload for debug
  let debugPayload = null;
  try {
    const payload = buildGlsPayload(shipment);
    debugPayload = redactPayload(payload);
  } catch (e) {
    debugPayload = { error: e.message };
  }

  const method = getShippingMethodByKey(shipment.shipping_method);

  res.render('shipments/detail', {
    shipment,
    method,
    shippingMethods: SHIPPING_METHODS,
    debugPayload,
    error: null,
  });
});

/**
 * POST /shipments/:id/generate-label — Send to GLS, generate label, build tracking URL, sync to Holded
 */
router.post('/:id/generate-label', async (req, res) => {
  const shipment = ShipmentModel.findById(req.params.id);
  if (!shipment) return res.status(404).send('Shipment not found');

  try {
    const result = await createShipment(shipment);

    if (result.success) {
      // Build tracking URL based on destination country
      let trackingUrl = null;
      let trackingError = null;
      try {
        trackingUrl = buildTrackingUrl({
          trackingNumber: result.trackingNumber,
          postcode: shipment.recipient_postal_code,
          country: shipment.recipient_country,
          expeditionId: result.expeditionId,
        });
      } catch (e) {
        trackingError = e.message;
      }

      ShipmentModel.updateGlsResult(shipment.id, {
        trackingNumber: result.trackingNumber,
        expeditionId: result.expeditionId,
        labelData: result.labelBase64,
        trackingUrl,
        requestPayload: result.requestPayload,
        responsePayload: result.rawResponse,
        status: trackingUrl ? 'LABEL_GENERATED' : 'ERROR',
      });

      // Sync tracking URL to Holded if we have a document ID and a valid URL
      if (trackingUrl && shipment.holded_doc_id) {
        const syncResult = await holdedService.updateTracking(
          'waybill',
          shipment.holded_doc_id,
          { trackingNumber: result.trackingNumber, trackingUrl },
        );

        ShipmentModel.updateHoldedTrackingSync(shipment.id, {
          syncStatus: syncResult.success ? 'SYNCED' : 'SYNC_ERROR',
          payload: syncResult.payload,
        });
      } else if (trackingError) {
        ShipmentModel.updateHoldedTrackingSync(shipment.id, {
          syncStatus: 'BLOCKED',
          payload: { error: trackingError },
        });
      }
    } else {
      ShipmentModel.updateGlsResult(shipment.id, {
        trackingNumber: null,
        expeditionId: null,
        labelData: null,
        trackingUrl: null,
        requestPayload: result.requestPayload,
        responsePayload: { error: result.error },
        status: 'ERROR',
      });
    }

    res.redirect(`/shipments/${shipment.id}`);
  } catch (err) {
    const debugPayload = (() => {
      try { return redactPayload(buildGlsPayload(shipment)); } catch { return null; }
    })();
    const method = getShippingMethodByKey(shipment.shipping_method);
    res.render('shipments/detail', {
      shipment: ShipmentModel.findById(shipment.id),
      method,
      shippingMethods: SHIPPING_METHODS,
      debugPayload,
      error: err.message,
    });
  }
});

/**
 * POST /shipments/:id/delete-tracking — Clear tracking data and notify Holded
 */
router.post('/:id/delete-tracking', async (req, res) => {
  const shipment = ShipmentModel.findById(req.params.id);
  if (!shipment) return res.status(404).send('Shipment not found');

  // Clear tracking on Holded side first
  if (shipment.holded_doc_id) {
    await holdedService.clearTracking('waybill', shipment.holded_doc_id);
  }

  // Clear all local tracking data
  ShipmentModel.clearTracking(shipment.id);

  res.redirect(`/shipments/${shipment.id}`);
});

/**
 * POST /shipments/:id/regenerate-label — Clear old tracking, generate new label, sync to Holded
 */
router.post('/:id/regenerate-label', async (req, res) => {
  const shipment = ShipmentModel.findById(req.params.id);
  if (!shipment) return res.status(404).send('Shipment not found');

  // Step 1: Clear Holded tracking first
  if (shipment.holded_doc_id) {
    await holdedService.clearTracking('waybill', shipment.holded_doc_id);
  }

  // Step 2: Clear local tracking
  ShipmentModel.clearTracking(shipment.id);

  // Step 3: Re-read fresh shipment (now in PENDING state) and generate
  const freshShipment = ShipmentModel.findById(shipment.id);

  try {
    const result = await createShipment(freshShipment);

    if (result.success) {
      let trackingUrl = null;
      try {
        trackingUrl = buildTrackingUrl({
          trackingNumber: result.trackingNumber,
          postcode: freshShipment.recipient_postal_code,
          country: freshShipment.recipient_country,
          expeditionId: result.expeditionId,
        });
      } catch (e) {
        // trackingUrl stays null
      }

      ShipmentModel.updateGlsResult(freshShipment.id, {
        trackingNumber: result.trackingNumber,
        expeditionId: result.expeditionId,
        labelData: result.labelBase64,
        trackingUrl,
        requestPayload: result.requestPayload,
        responsePayload: result.rawResponse,
        status: trackingUrl ? 'LABEL_GENERATED' : 'ERROR',
      });

      // Sync new tracking URL to Holded
      if (trackingUrl && freshShipment.holded_doc_id) {
        const syncResult = await holdedService.updateTracking(
          'waybill',
          freshShipment.holded_doc_id,
          { trackingNumber: result.trackingNumber, trackingUrl },
        );
        ShipmentModel.updateHoldedTrackingSync(freshShipment.id, {
          syncStatus: syncResult.success ? 'SYNCED' : 'SYNC_ERROR',
          payload: syncResult.payload,
        });
      }
    } else {
      ShipmentModel.updateGlsResult(freshShipment.id, {
        trackingNumber: null,
        expeditionId: null,
        labelData: null,
        trackingUrl: null,
        requestPayload: result.requestPayload,
        responsePayload: { error: result.error },
        status: 'ERROR',
      });
    }
  } catch (err) {
    // Leave in PENDING state on unexpected error
  }

  res.redirect(`/shipments/${shipment.id}`);
});

/**
 * POST /shipments/:id/sync-tracking — Manually re-sync tracking URL to Holded
 */
router.post('/:id/sync-tracking', async (req, res) => {
  const shipment = ShipmentModel.findById(req.params.id);
  if (!shipment) return res.status(404).send('Shipment not found');

  if (!shipment.tracking_url) {
    return res.redirect(`/shipments/${shipment.id}`);
  }

  if (shipment.holded_doc_id) {
    const syncResult = await holdedService.updateTracking(
      'waybill',
      shipment.holded_doc_id,
      { trackingNumber: shipment.gls_tracking_number, trackingUrl: shipment.tracking_url },
    );
    ShipmentModel.updateHoldedTrackingSync(shipment.id, {
      syncStatus: syncResult.success ? 'SYNCED' : 'SYNC_ERROR',
      payload: syncResult.payload,
    });
  }

  res.redirect(`/shipments/${shipment.id}`);
});

/**
 * GET /shipments/:id/label — Download label PDF/image
 */
router.get('/:id/label', (req, res) => {
  const shipment = ShipmentModel.findById(req.params.id);
  if (!shipment || !shipment.gls_label_data) {
    return res.status(404).send('Label not available');
  }
  const buffer = Buffer.from(shipment.gls_label_data, 'base64');
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="label-${shipment.gls_tracking_number || shipment.id}.pdf"`);
  res.send(buffer);
});

module.exports = router;
