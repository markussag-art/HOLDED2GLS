-- CreateTable
CREATE TABLE "Shipment" (
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
    "recipientName" TEXT,
    "recipientAddress" TEXT,
    "recipientCity" TEXT,
    "recipientPostalCode" TEXT,
    "recipientCountry" TEXT DEFAULT 'ES',
    "weight" REAL,
    "packages" INTEGER DEFAULT 1,
    "reference" TEXT,
    "lockUntil" DATETIME,
    "lockedBy" TEXT
);

-- CreateIndex
CREATE INDEX "Shipment_holdedDocumentId_idx" ON "Shipment"("holdedDocumentId");

-- CreateIndex
CREATE INDEX "Shipment_trackingSyncStatus_idx" ON "Shipment"("trackingSyncStatus");
