const { getDb } = require('../config/database');

const ShipmentModel = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO shipments (
        holded_doc_id, holded_doc_number, holded_waybill_number,
        recipient_name, recipient_commercial_name,
        recipient_address, recipient_city, recipient_postal_code,
        recipient_province, recipient_country, recipient_phone, recipient_email,
        sender_name, sender_address, sender_city, sender_postal_code,
        sender_country, sender_cif, sender_phone, sender_email,
        shipping_method, gls_service_code,
        delivery_morning, delivery_afternoon, delivery_notes,
        weight, packages, status
      ) VALUES (
        @holdedDocId, @holdedDocNumber, @holdedWaybillNumber,
        @recipientName, @recipientCommercialName,
        @recipientAddress, @recipientCity, @recipientPostalCode,
        @recipientProvince, @recipientCountry, @recipientPhone, @recipientEmail,
        @senderName, @senderAddress, @senderCity, @senderPostalCode,
        @senderCountry, @senderCif, @senderPhone, @senderEmail,
        @shippingMethod, @glsServiceCode,
        @deliveryMorning, @deliveryAfternoon, @deliveryNotes,
        @weight, @packages, @status
      )
    `);

    const result = stmt.run({
      holdedDocId: data.holdedDocId || null,
      holdedDocNumber: data.holdedDocNumber || null,
      holdedWaybillNumber: data.holdedWaybillNumber || null,
      recipientName: data.recipientName || '',
      recipientCommercialName: data.recipientCommercialName || '',
      recipientAddress: data.recipientAddress || '',
      recipientCity: data.recipientCity || '',
      recipientPostalCode: data.recipientPostalCode || '',
      recipientProvince: data.recipientProvince || '',
      recipientCountry: data.recipientCountry || 'ES',
      recipientPhone: data.recipientPhone || '',
      recipientEmail: data.recipientEmail || '',
      senderName: data.senderName || 'Yogufruta SCP',
      senderAddress: data.senderAddress || 'C/ LA SELVA, 26 1º-2',
      senderCity: data.senderCity || 'Blanes',
      senderPostalCode: data.senderPostalCode || '17300',
      senderCountry: data.senderCountry || 'ES',
      senderCif: data.senderCif || 'J65549842',
      senderPhone: data.senderPhone || '',
      senderEmail: data.senderEmail || '',
      shippingMethod: data.shippingMethod || 'NATIONAL_STANDARD',
      glsServiceCode: data.glsServiceCode || '1',
      deliveryMorning: data.deliveryMorning ? 1 : 0,
      deliveryAfternoon: data.deliveryAfternoon ? 1 : 0,
      deliveryNotes: data.deliveryNotes || '',
      weight: data.weight || 1.0,
      packages: data.packages || 1,
      status: data.status || 'PENDING',
    });

    return this.findById(result.lastInsertRowid);
  },

  findById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
  },

  findAll(limit = 50, offset = 0) {
    const db = getDb();
    return db.prepare('SELECT * FROM shipments ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  },

  update(id, data) {
    const db = getDb();
    const fields = [];
    const values = {};

    for (const [key, value] of Object.entries(data)) {
      // Convert camelCase to snake_case
      const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${col} = @${key}`);
      values[key] = value;
    }

    if (fields.length === 0) return this.findById(id);

    fields.push("updated_at = datetime('now')");
    values.id = id;

    db.prepare(`UPDATE shipments SET ${fields.join(', ')} WHERE id = @id`).run(values);
    return this.findById(id);
  },

  updateGlsResult(id, { trackingNumber, labelData, requestPayload, responsePayload, status }) {
    const db = getDb();
    db.prepare(`
      UPDATE shipments SET
        gls_tracking_number = ?,
        gls_label_data = ?,
        gls_request_payload = ?,
        gls_response_payload = ?,
        status = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      trackingNumber || null,
      labelData || null,
      requestPayload ? JSON.stringify(requestPayload) : null,
      responsePayload ? JSON.stringify(responsePayload) : null,
      status || 'LABEL_GENERATED',
      id,
    );
    return this.findById(id);
  },

  delete(id) {
    const db = getDb();
    return db.prepare('DELETE FROM shipments WHERE id = ?').run(id);
  },
};

module.exports = ShipmentModel;
