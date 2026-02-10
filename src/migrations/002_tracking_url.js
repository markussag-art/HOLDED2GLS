/**
 * Migration 002: Add tracking URL fields (expeditionId, trackingUrl, holdedTrackingSyncStatus).
 */
function up(db) {
  db.exec(`
    ALTER TABLE shipments ADD COLUMN expedition_id TEXT DEFAULT NULL;
    ALTER TABLE shipments ADD COLUMN tracking_url TEXT DEFAULT NULL;
    ALTER TABLE shipments ADD COLUMN holded_tracking_sync_status TEXT DEFAULT 'NOT_SYNCED';
    ALTER TABLE shipments ADD COLUMN holded_tracking_payload TEXT DEFAULT NULL;
  `);
}

function down(db) {
  // SQLite does not support DROP COLUMN before 3.35.0; recreate table if needed.
  // For safety, this is a no-op.
}

module.exports = { up, down, name: '002_tracking_url' };
