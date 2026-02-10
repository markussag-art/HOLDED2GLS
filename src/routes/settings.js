const express = require('express');
const router = express.Router();
const SettingsModel = require('../models/Settings');

/**
 * GET /settings — View/edit sender defaults
 */
router.get('/', (req, res) => {
  const sender = SettingsModel.getSender();
  res.render('settings/index', { sender, saved: req.query.saved === '1' });
});

/**
 * POST /settings — Update sender defaults
 */
router.post('/', (req, res) => {
  const body = req.body;
  SettingsModel.updateSender({
    name: body.senderName,
    address: body.senderAddress,
    city: body.senderCity,
    postalCode: body.senderPostalCode,
    country: body.senderCountry,
    cif: body.senderCif,
    phone: body.senderPhone,
    email: body.senderEmail,
  });
  res.redirect('/settings?saved=1');
});

module.exports = router;
