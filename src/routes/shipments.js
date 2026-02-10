const express = require('express');
const router = express.Router();
const ShipmentModel = require('../models/Shipment');
const SettingsModel = require('../models/Settings');
const { SHIPPING_METHODS, getShippingMethodByKey } = require('../config/gls');
const { buildGlsPayload, redactPayload, createShipment } = require('../services/glsService');
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
 * POST /shipments/:id/generate-label — Send to GLS and generate label
 */
router.post('/:id/generate-label', async (req, res) => {
  const shipment = ShipmentModel.findById(req.params.id);
  if (!shipment) return res.status(404).send('Shipment not found');

  try {
    const result = await createShipment(shipment);

    if (result.success) {
      ShipmentModel.updateGlsResult(shipment.id, {
        trackingNumber: result.trackingNumber,
        labelData: result.labelBase64,
        requestPayload: result.requestPayload,
        responsePayload: result.rawResponse,
        status: 'LABEL_GENERATED',
      });
    } else {
      ShipmentModel.updateGlsResult(shipment.id, {
        trackingNumber: null,
        labelData: null,
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
