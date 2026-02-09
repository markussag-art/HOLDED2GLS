-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "holdedDocType" TEXT NOT NULL,
    "holdedDocumentId" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "labelData" TEXT,
    "labelObsolete" BOOLEAN NOT NULL DEFAULT false,
    "trackingSyncedAt" DATETIME,
    "trackingSyncStatus" TEXT NOT NULL DEFAULT 'NOT_SYNCED',
    "trackingSyncError" TEXT,
    "holdedTrackingPayload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" DATETIME,
    "holdedCompletedAt" DATETIME,
    "holdedEmailSentAt" DATETIME,
    "holdedEmailStatus" TEXT NOT NULL DEFAULT 'NOT_SENT',
    "holdedEmailError" TEXT,
    "recipientName" TEXT,
    "recipientAddress" TEXT,
    "recipientCity" TEXT,
    "recipientPostalCode" TEXT,
    "recipientCountry" TEXT DEFAULT 'ES',
    "recipientEmail" TEXT,
    "weight" REAL,
    "packages" INTEGER DEFAULT 1,
    "reference" TEXT,
    "lockUntil" DATETIME,
    "lockedBy" TEXT
);
INSERT INTO "new_Shipment" ("carrier", "createdAt", "holdedDocType", "holdedDocumentId", "holdedTrackingPayload", "id", "labelData", "labelObsolete", "lockUntil", "lockedBy", "packages", "recipientAddress", "recipientCity", "recipientCountry", "recipientName", "recipientPostalCode", "reference", "trackingNumber", "trackingSyncError", "trackingSyncStatus", "trackingSyncedAt", "trackingUrl", "updatedAt", "weight") SELECT "carrier", "createdAt", "holdedDocType", "holdedDocumentId", "holdedTrackingPayload", "id", "labelData", "labelObsolete", "lockUntil", "lockedBy", "packages", "recipientAddress", "recipientCity", "recipientCountry", "recipientName", "recipientPostalCode", "reference", "trackingNumber", "trackingSyncError", "trackingSyncStatus", "trackingSyncedAt", "trackingUrl", "updatedAt", "weight" FROM "Shipment";
DROP TABLE "Shipment";
ALTER TABLE "new_Shipment" RENAME TO "Shipment";
CREATE INDEX "Shipment_holdedDocumentId_idx" ON "Shipment"("holdedDocumentId");
CREATE INDEX "Shipment_trackingSyncStatus_idx" ON "Shipment"("trackingSyncStatus");
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
