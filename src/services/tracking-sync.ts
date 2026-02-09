import { prisma } from "@/lib/prisma";
import { holded, HoldedApiError } from "@/services/holded";
import { createGLSShipment, cancelGLSShipment, validateLabelReady } from "@/services/gls";
import type { HoldedCarrierKey, HoldedTrackingPayload } from "@/types/holded";
import type { Shipment } from "@/generated/prisma/client";

const LOCK_TIMEOUT_MS = 30_000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000; // 1s, 2s, 4s exponential

// --- Carrier mapping ---

function carrierToHoldedKey(carrier: string): HoldedCarrierKey {
  switch (carrier.toUpperCase()) {
    case "MRW":
      return "mrw";
    case "GLS":
    default:
      return "other";
  }
}

function carrierDisplayName(carrier: string): string {
  switch (carrier.toUpperCase()) {
    case "MRW":
      return "MRW";
    case "GLS":
      return "GLS Spain";
    default:
      return carrier;
  }
}

// --- Concurrency lock ---

async function acquireLock(shipmentId: string): Promise<boolean> {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + LOCK_TIMEOUT_MS);
  const lockId = `${shipmentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Atomically try to acquire lock: only if no current lock or lock expired
  const result = await prisma.shipment.updateMany({
    where: {
      id: shipmentId,
      OR: [
        { lockUntil: null },
        { lockUntil: { lt: now } },
      ],
    },
    data: {
      lockUntil,
      lockedBy: lockId,
    },
  });

  return result.count > 0;
}

async function releaseLock(shipmentId: string): Promise<void> {
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      lockUntil: null,
      lockedBy: null,
    },
  });
}

// --- Retry helper ---

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// --- Build payload ---

function buildTrackingPayload(
  shipment: Shipment
): HoldedTrackingPayload | null {
  if (!shipment.trackingNumber) {
    return null; // Will clear tracking
  }

  return {
    key: carrierToHoldedKey(shipment.carrier),
    name: carrierDisplayName(shipment.carrier),
    num: shipment.trackingNumber,
  };
}

// --- Core sync functions ---

/**
 * Sync tracking info to Holded for a given shipment.
 * Handles idempotency: skips if already synced with same payload.
 */
export async function syncTrackingToHolded(
  shipmentId: string
): Promise<Shipment> {
  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
  });

  const payload = buildTrackingPayload(shipment);
  const payloadJson = JSON.stringify(payload);

  // Idempotency: skip if already synced with same payload
  if (
    shipment.trackingSyncStatus === "SYNCED" &&
    shipment.holdedTrackingPayload === payloadJson
  ) {
    return shipment;
  }

  try {
    await withRetry(() =>
      holded.updateTrackingInfo({
        docType: shipment.holdedDocType as "waybill" | "salesorder",
        documentId: shipment.holdedDocumentId,
        tracking: payload,
      })
    );

    return await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        trackingSyncedAt: new Date(),
        trackingSyncStatus: "SYNCED",
        trackingSyncError: null,
        holdedTrackingPayload: payloadJson,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof HoldedApiError
        ? `Holded API ${error.statusCode}: ${error.responseBody}`
        : error instanceof Error
          ? error.message
          : String(error);

    return await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        trackingSyncStatus: "ERROR",
        trackingSyncError: errorMessage,
        holdedTrackingPayload: payloadJson,
      },
    });
  }
}

/**
 * Generate a label for a shipment (GLS) and sync tracking to Holded.
 * Acquires a lock to prevent concurrent label creation.
 */
export async function generateLabel(shipmentId: string): Promise<Shipment> {
  const locked = await acquireLock(shipmentId);
  if (!locked) {
    throw new Error(
      "Shipment is currently being processed. Please wait and try again."
    );
  }

  try {
    const shipment = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
    });

    // Refuse if already has an active tracking number
    if (shipment.trackingNumber && !shipment.labelObsolete) {
      throw new Error(
        "Shipment already has an active tracking number. Use regenerate instead."
      );
    }

    // Validate label-ready requirements
    const glsRequest = {
      recipientName: shipment.recipientName ?? "",
      recipientAddress: shipment.recipientAddress ?? "",
      recipientCity: shipment.recipientCity ?? "",
      recipientPostalCode: shipment.recipientPostalCode ?? "",
      recipientCountry: shipment.recipientCountry ?? "ES",
      recipientPhone: shipment.recipientPhone ?? undefined,
      recipientEmail: shipment.recipientEmail ?? undefined,
      recipientProvince: shipment.recipientProvince ?? undefined,
      weight: shipment.weight ?? 0,
      packages: shipment.packages ?? 0,
      // Append timestamp suffix if label was previously generated (avoid GLS duplicate error)
      reference: shipment.labelObsolete && shipment.reference
        ? `${shipment.reference}-R${Date.now().toString(36)}`
        : shipment.reference ?? undefined,
    };
    const validationErrors = validateLabelReady(glsRequest);
    if (validationErrors.length > 0) {
      const missingFields = validationErrors.map((e) => e.message).join("; ");
      throw new Error(`Label not ready: ${missingFields}`);
    }

    // Create GLS shipment
    const glsResult = await createGLSShipment(glsRequest);

    // Persist tracking info locally and set status to LABELED
    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        trackingNumber: glsResult.trackingNumber,
        trackingUrl: glsResult.trackingUrl,
        labelData: glsResult.labelData,
        labelObsolete: false,
        status: "LABELED",
        trackingSyncStatus: "NOT_SYNCED",
      },
    });

    // Sync to Holded (non-blocking for label — label is saved regardless)
    return await syncTrackingToHolded(updated.id);
  } finally {
    await releaseLock(shipmentId);
  }
}

/**
 * Delete tracking from a shipment and clear it in Holded.
 */
export async function deleteTracking(shipmentId: string): Promise<Shipment> {
  const locked = await acquireLock(shipmentId);
  if (!locked) {
    throw new Error(
      "Shipment is currently being processed. Please wait and try again."
    );
  }

  try {
    const shipment = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
    });

    if (!shipment.trackingNumber) {
      throw new Error("Shipment has no tracking number to delete.");
    }

    // Cancel the shipment in GLS first (best-effort)
    try {
      await cancelGLSShipment(shipment.trackingNumber);
    } catch (error) {
      console.warn("[deleteTracking] GLS cancel failed (continuing):", error);
    }

    // Clear local tracking fields and reset status to PENDING
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        trackingNumber: null,
        trackingUrl: null,
        labelObsolete: true,
        status: "PENDING",
        trackingSyncStatus: "NOT_SYNCED",
        trackingSyncError: null,
        holdedTrackingPayload: null,
      },
    });

    // Clear tracking in Holded
    return await syncTrackingToHolded(shipmentId);
  } finally {
    await releaseLock(shipmentId);
  }
}

/**
 * Regenerate label: clear old tracking in Holded, create new GLS shipment,
 * then sync new tracking to Holded.
 */
export async function regenerateLabel(shipmentId: string): Promise<Shipment> {
  const locked = await acquireLock(shipmentId);
  if (!locked) {
    throw new Error(
      "Shipment is currently being processed. Please wait and try again."
    );
  }

  try {
    const shipment = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
    });

    // Step 1: If has existing tracking, cancel in GLS and clear in Holded
    if (shipment.trackingNumber) {
      // Cancel the old shipment in GLS first (best-effort)
      try {
        await cancelGLSShipment(shipment.trackingNumber);
      } catch (error) {
        console.warn("[regenerateLabel] GLS cancel failed (continuing):", error);
      }

      // Clear local tracking
      await prisma.shipment.update({
        where: { id: shipmentId },
        data: {
          trackingNumber: null,
          trackingUrl: null,
          labelObsolete: true,
          trackingSyncStatus: "NOT_SYNCED",
          holdedTrackingPayload: null,
        },
      });

      // Clear in Holded
      try {
        await withRetry(() =>
          holded.updateTrackingInfo({
            docType: shipment.holdedDocType as "waybill" | "salesorder",
            documentId: shipment.holdedDocumentId,
            tracking: null, // Clear tracking
          })
        );
      } catch (error) {
        // Clear Holded failed — update status but continue to allow retry
        const errorMsg =
          error instanceof Error ? error.message : String(error);
        await prisma.shipment.update({
          where: { id: shipmentId },
          data: {
            trackingSyncStatus: "ERROR",
            trackingSyncError: `Failed to clear old tracking in Holded: ${errorMsg}`,
          },
        });
        throw new Error(
          `Failed to clear old tracking in Holded: ${errorMsg}. New label was not created.`
        );
      }
    }

    // Step 2: Create new GLS shipment
    let glsResult;
    try {
      glsResult = await createGLSShipment({
        recipientName: shipment.recipientName ?? "",
        recipientAddress: shipment.recipientAddress ?? "",
        recipientCity: shipment.recipientCity ?? "",
        recipientPostalCode: shipment.recipientPostalCode ?? "",
        recipientCountry: shipment.recipientCountry ?? "ES",
        recipientPhone: shipment.recipientPhone ?? undefined,
        recipientEmail: shipment.recipientEmail ?? undefined,
        recipientProvince: shipment.recipientProvince ?? undefined,
        weight: shipment.weight ?? 1,
        packages: shipment.packages ?? 1,
        // Append timestamp suffix to avoid GLS "Ya existe el albaran" duplicate error
        reference: shipment.reference
          ? `${shipment.reference}-R${Date.now().toString(36)}`
          : undefined,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await prisma.shipment.update({
        where: { id: shipmentId },
        data: {
          trackingSyncStatus: "ERROR",
          trackingSyncError: `Old tracking cleared in Holded, but new GLS shipment creation failed: ${errorMsg}`,
        },
      });
      throw new Error(
        `GLS shipment creation failed after clearing old tracking: ${errorMsg}`
      );
    }

    // Step 3: Persist new tracking locally
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        trackingNumber: glsResult.trackingNumber,
        trackingUrl: glsResult.trackingUrl,
        labelData: glsResult.labelData,
        labelObsolete: false,
        trackingSyncStatus: "NOT_SYNCED",
      },
    });

    // Step 4: Sync new tracking to Holded
    return await syncTrackingToHolded(shipmentId);
  } finally {
    await releaseLock(shipmentId);
  }
}

/**
 * Retry syncing tracking to Holded (for failed syncs).
 * Only retries the Holded call — never creates a new carrier shipment.
 */
export async function retrySync(shipmentId: string): Promise<Shipment> {
  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
  });

  if (shipment.trackingSyncStatus !== "ERROR") {
    throw new Error("Sync is not in error state. Nothing to retry.");
  }

  return await syncTrackingToHolded(shipmentId);
}
