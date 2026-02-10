const { getDb } = require('../config/database');
const { SENDER_DEFAULTS } = require('../config/defaults');

const SettingsModel = {
  get(key) {
    const db = getDb();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  },

  set(key, value) {
    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))').run(key, value);
  },

  getAll() {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const result = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  },

  /**
   * Returns sender info from DB settings, falling back to SENDER_DEFAULTS.
   */
  getSender() {
    return {
      name: this.get('sender_name') || SENDER_DEFAULTS.name,
      address: this.get('sender_address') || SENDER_DEFAULTS.address,
      city: this.get('sender_city') || SENDER_DEFAULTS.city,
      postalCode: this.get('sender_postal_code') || SENDER_DEFAULTS.postalCode,
      country: this.get('sender_country') || SENDER_DEFAULTS.country,
      cif: this.get('sender_cif') || SENDER_DEFAULTS.cif,
      phone: this.get('sender_phone') || SENDER_DEFAULTS.phone,
      email: this.get('sender_email') || SENDER_DEFAULTS.email,
    };
  },

  /**
   * Update sender settings in bulk.
   */
  updateSender(senderData) {
    if (senderData.name) this.set('sender_name', senderData.name);
    if (senderData.address) this.set('sender_address', senderData.address);
    if (senderData.city) this.set('sender_city', senderData.city);
    if (senderData.postalCode) this.set('sender_postal_code', senderData.postalCode);
    if (senderData.country) this.set('sender_country', senderData.country);
    if (senderData.cif) this.set('sender_cif', senderData.cif);
    if (senderData.phone !== undefined) this.set('sender_phone', senderData.phone);
    if (senderData.email !== undefined) this.set('sender_email', senderData.email);
  },
};

module.exports = SettingsModel;
