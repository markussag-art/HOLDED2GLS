-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "holdedApiKey" TEXT NOT NULL DEFAULT '',
    "holdedDocType" TEXT NOT NULL DEFAULT 'waybill',
    "glsUsername" TEXT NOT NULL DEFAULT '',
    "glsPassword" TEXT NOT NULL DEFAULT '',
    "glsContactId" TEXT NOT NULL DEFAULT '',
    "glsBaseUrl" TEXT NOT NULL DEFAULT 'https://shipit-wbm-es01.gls-group.eu:8443/backend/rs',
    "glsDefaultService" TEXT NOT NULL DEFAULT 'BusinessParcel',
    "senderName" TEXT NOT NULL DEFAULT '',
    "senderCif" TEXT NOT NULL DEFAULT '',
    "senderAddress" TEXT NOT NULL DEFAULT '',
    "senderCity" TEXT NOT NULL DEFAULT '',
    "senderProvince" TEXT NOT NULL DEFAULT '',
    "senderPostalCode" TEXT NOT NULL DEFAULT '',
    "senderCountry" TEXT NOT NULL DEFAULT 'ES',
    "senderCountryCode" TEXT NOT NULL DEFAULT 'ES',
    "senderPhone" TEXT NOT NULL DEFAULT '',
    "senderEmail" TEXT NOT NULL DEFAULT '',
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoSyncMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "holdedDocType" TEXT NOT NULL,
    "holdedDocId" TEXT NOT NULL,
    "holdedDocNumber" TEXT NOT NULL,
    "holdedStatusRaw" TEXT NOT NULL DEFAULT '',
    "holdedContactId" TEXT NOT NULL DEFAULT '',
    "holdedSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "localStatus" TEXT NOT NULL DEFAULT 'Pending',
    "recipientName" TEXT NOT NULL DEFAULT '',
    "recipientCompany" TEXT NOT NULL DEFAULT '',
    "recipientPhone" TEXT NOT NULL DEFAULT '',
    "recipientEmail" TEXT NOT NULL DEFAULT '',
    "address1" TEXT NOT NULL DEFAULT '',
    "address2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "province" TEXT NOT NULL DEFAULT '',
    "postcode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'ES',
    "countryCode" TEXT NOT NULL DEFAULT 'ES',
    "parcelsCount" INTEGER NOT NULL DEFAULT 1,
    "totalWeightKg" REAL NOT NULL DEFAULT 0,
    "parcelWeights" TEXT NOT NULL DEFAULT '[]',
    "carrier" TEXT NOT NULL DEFAULT 'GLS',
    "serviceType" TEXT NOT NULL DEFAULT 'BusinessParcel',
    "serviceCode" TEXT NOT NULL DEFAULT '',
    "trackingNumber" TEXT NOT NULL DEFAULT '',
    "labelPdfPath" TEXT NOT NULL DEFAULT '',
    "labelRawResponse" TEXT NOT NULL DEFAULT '',
    "orderReference" TEXT NOT NULL DEFAULT '',
    "customerReference" TEXT NOT NULL DEFAULT '',
    "shippingNotes" TEXT NOT NULL DEFAULT '',
    "docTotal" REAL NOT NULL DEFAULT 0,
    "docCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "labelGeneratedAt" DATETIME,
    "shippedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "shipmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Shipment_localStatus_idx" ON "Shipment"("localStatus");

-- CreateIndex
CREATE INDEX "Shipment_holdedDocNumber_idx" ON "Shipment"("holdedDocNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_holdedDocId_holdedDocType_key" ON "Shipment"("holdedDocId", "holdedDocType");

-- CreateIndex
CREATE INDEX "AuditLog_shipmentId_idx" ON "AuditLog"("shipmentId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
