import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dir = path.dirname(config.db.path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(config.db.path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function initDb(): void {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS shipments (
      id                          TEXT PRIMARY KEY,
      holdedDocumentId            TEXT NOT NULL,
      holdedDocType               TEXT NOT NULL DEFAULT 'waybill',
      waybillNumber               TEXT NOT NULL DEFAULT '',

      recipientName               TEXT NOT NULL DEFAULT '',
      recipientCommercialName     TEXT NOT NULL DEFAULT '',
      recipientAddress            TEXT NOT NULL DEFAULT '',
      recipientCity               TEXT NOT NULL DEFAULT '',
      recipientProvince           TEXT NOT NULL DEFAULT '',
      recipientPostcode           TEXT NOT NULL DEFAULT '',
      recipientCountry            TEXT NOT NULL DEFAULT '',
      recipientPhone              TEXT NOT NULL DEFAULT '',
      recipientEmail              TEXT NOT NULL DEFAULT '',

      weight                      REAL NOT NULL DEFAULT 1,
      packages                    INTEGER NOT NULL DEFAULT 1,
      shippingMethod              TEXT NOT NULL DEFAULT '',
      deliveryNotes               TEXT NOT NULL DEFAULT '',

      trackingNumber              TEXT,
      expeditionId                TEXT,
      labelPdfPath                TEXT,
      glsRawResponse              TEXT,
      trackingUrl                 TEXT,

      holdedTrackingSyncStatus    TEXT NOT NULL DEFAULT 'NOT_SYNCED',
      holdedTrackingSyncError     TEXT,

      holdedCustomFieldSyncStatus TEXT NOT NULL DEFAULT 'NOT_SYNCED',
      holdedCustomFieldSyncError  TEXT,

      holdedStageSyncStatus       TEXT NOT NULL DEFAULT 'NOT_SYNCED',
      holdedStageSyncError        TEXT,
      holdedStageIdLastSet        TEXT,

      localStatus                 TEXT NOT NULL DEFAULT 'PENDING',

      createdAt                   TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt                   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_shipments_holded_doc
      ON shipments(holdedDocumentId);

    CREATE INDEX IF NOT EXISTS idx_shipments_local_status
      ON shipments(localStatus);

    CREATE INDEX IF NOT EXISTS idx_shipments_tracking
      ON shipments(trackingNumber);
  `);

  logger.info('Database initialized');
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
