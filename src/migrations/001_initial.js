/**
 * Migration 001: Create shipments and settings tables.
 */
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      -- Holded source data
      holded_doc_id TEXT,
      holded_doc_number TEXT,
      holded_waybill_number TEXT,

      -- Recipient
      recipient_name TEXT,
      recipient_commercial_name TEXT,
      recipient_address TEXT,
      recipient_city TEXT,
      recipient_postal_code TEXT,
      recipient_province TEXT,
      recipient_country TEXT DEFAULT 'ES',
      recipient_phone TEXT,
      recipient_email TEXT,

      -- Sender / Emitter (defaults to Yogufruta SCP)
      sender_name TEXT DEFAULT 'Yogufruta SCP',
      sender_address TEXT DEFAULT 'C/ LA SELVA, 26 1º-2',
      sender_city TEXT DEFAULT 'Blanes',
      sender_postal_code TEXT DEFAULT '17300',
      sender_country TEXT DEFAULT 'ES',
      sender_cif TEXT DEFAULT 'J65549842',
      sender_phone TEXT DEFAULT '',
      sender_email TEXT DEFAULT '',

      -- Shipping method
      shipping_method TEXT NOT NULL DEFAULT 'NATIONAL_STANDARD',
      gls_service_code TEXT,

      -- Delivery window / notes
      delivery_morning INTEGER DEFAULT 0,
      delivery_afternoon INTEGER DEFAULT 0,
      delivery_notes TEXT DEFAULT '',

      -- Package info
      weight REAL DEFAULT 1.0,
      packages INTEGER DEFAULT 1,

      -- GLS response
      gls_tracking_number TEXT,
      gls_label_data TEXT,
      gls_request_payload TEXT,
      gls_response_payload TEXT,

      -- Status
      status TEXT DEFAULT 'PENDING',

      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed default sender settings
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
  `);

  upsert.run('sender_name', 'Yogufruta SCP');
  upsert.run('sender_address', 'C/ LA SELVA, 26 1º-2');
  upsert.run('sender_city', 'Blanes');
  upsert.run('sender_postal_code', '17300');
  upsert.run('sender_country', 'ES');
  upsert.run('sender_cif', 'J65549842');
  upsert.run('sender_phone', '');
  upsert.run('sender_email', '');
}

function down(db) {
  db.exec(`
    DROP TABLE IF EXISTS shipments;
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS migrations;
  `);
}

module.exports = { up, down, name: '001_initial' };
