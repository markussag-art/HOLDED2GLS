import { prisma } from "@/lib/prisma";
import { holded, HoldedApiError } from "@/services/holded";
import type { Shipment } from "@/generated/prisma/client";

/**
 * Get the Holded pipeline stage ID for "Completed".
 * This is account-specific and must be configured via environment variable.
 */
function getCompletedPipelineId(): string {
  const id = process.env.HOLDED_COMPLETED_PIPELINE_ID;
  if (!id) {
    throw new Error(
      "HOLDED_COMPLETED_PIPELINE_ID environment variable is not set. " +
        "Set it to the pipeline stage ID representing 'Completed' in your Holded account."
    );
  }
  return id;
}

/**
 * Get the optional Holded email template ID for waybill emails.
 */
function getMailTemplateId(): string | undefined {
  return process.env.HOLDED_WAYBILL_MAIL_TEMPLATE_ID || undefined;
}

/**
 * Build an audit log entry (redacts secrets).
 */
function auditLog(
  action: string,
  shipmentId: string,
  holdedDocType: string,
  holdedDocumentId: string,
  details: Record<string, unknown>
) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    shipmentId,
    holdedDocType,
    holdedDocumentId,
    ...details,
  };
  // Log to stdout (structured); in production, send to a logging service.
  console.log("[AUDIT]", JSON.stringify(entry));
}

/**
 * Complete a shipment: mark as Completed in Holded + send waybill email.
 *
 * Preconditions:
 * - trackingNumber exists
 * - trackingSyncStatus == SYNCED
 * - status != COMPLETED
 *
 * Steps:
 * 1. Set Holded pipeline to "Completed"
 * 2. Send waybill email via Holded
 * 3. Update local DB to COMPLETED
 *
 * If pipeline succeeds but email fails, do NOT mark completed locally.
 */
export async function completeAndEmail(
  shipmentId: string
): Promise<Shipment> {
  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
  });

  // --- Pre-checks ---
  if (!shipment.holdedDocType || !shipment.holdedDocumentId) {
    throw new CompletionError("Shipment is not linked to a Holded document.");
  }
  if (!shipment.trackingNumber) {
    throw new CompletionError(
      "Cannot complete: no tracking number. Generate a label first."
    );
  }
  if (shipment.trackingSyncStatus !== "SYNCED") {
    throw new CompletionError(
      "Cannot complete: tracking has not been synced to Holded yet. Sync or retry first."
    );
  }
  if (shipment.status === "COMPLETED" && shipment.holdedEmailStatus === "SENT") {
    throw new CompletionError(
      "Already completed and email sent. Use resend if you need to send the email again."
    );
  }

  // Determine recipient email
  const recipientEmail = shipment.recipientEmail;
  if (!recipientEmail) {
    throw new CompletionError(
      "Customer email missing. Add the recipient email to the shipment before completing."
    );
  }

  const docType = shipment.holdedDocType as "waybill" | "salesorder";
  const docId = shipment.holdedDocumentId;
  const pipelineId = getCompletedPipelineId();

  // --- Step 1: Set pipeline to Completed in Holded ---
  // Skip if already marked completed in Holded (idempotency)
  if (!shipment.holdedCompletedAt) {
    try {
      const pipelineRes = await holded.setPipelineStage({
        docType,
        documentId: docId,
        pipelineStageId: pipelineId,
      });

      auditLog("PIPELINE_SET", shipmentId, docType, docId, {
        pipelineStageId: pipelineId,
        response: pipelineRes,
      });

      await prisma.shipment.update({
        where: { id: shipmentId },
        data: { holdedCompletedAt: new Date() },
      });
    } catch (error) {
      const errorMsg =
        error instanceof HoldedApiError
          ? `Holded API ${error.statusCode}: ${error.responseBody}`
          : error instanceof Error
            ? error.message
            : String(error);

      auditLog("PIPELINE_SET_FAILED", shipmentId, docType, docId, {
        error: errorMsg,
      });

      throw new CompletionError(
        `Failed to mark as Completed in Holded: ${errorMsg}`
      );
    }
  }

  // --- Step 2: Send waybill email via Holded ---
  try {
    const mailTemplateId = getMailTemplateId();
    const sendRes = await holded.sendDocument({
      docType,
      documentId: docId,
      payload: {
        emails: recipientEmail,
        ...(mailTemplateId ? { mailTemplateId } : {}),
      },
    });

    auditLog("EMAIL_SENT", shipmentId, docType, docId, {
      recipientEmail,
      mailTemplateId: mailTemplateId ?? "(default)",
      response: sendRes,
    });

    // --- Step 3: Update local status ---
    const now = new Date();
    return await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: "COMPLETED",
        completedAt: now,
        holdedEmailSentAt: now,
        holdedEmailStatus: "SENT",
        holdedEmailError: null,
      },
    });
  } catch (error) {
    const errorMsg =
      error instanceof HoldedApiError
        ? `Holded API ${error.statusCode}: ${error.responseBody}`
        : error instanceof Error
          ? error.message
          : String(error);

    auditLog("EMAIL_SEND_FAILED", shipmentId, docType, docId, {
      recipientEmail,
      error: errorMsg,
    });

    // Pipeline succeeded but email failed — do NOT mark completed
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        holdedEmailStatus: "ERROR",
        holdedEmailError: errorMsg,
      },
    });

    throw new CompletionError(
      `Holded marked as Completed, but email sending failed: ${errorMsg}`
    );
  }
}

/**
 * Resend the waybill email for an already-completed shipment.
 * This is idempotent-safe: only sends if explicitly requested.
 */
export async function resendEmail(shipmentId: string): Promise<Shipment> {
  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
  });

  if (!shipment.holdedDocType || !shipment.holdedDocumentId) {
    throw new CompletionError("Shipment is not linked to a Holded document.");
  }

  const recipientEmail = shipment.recipientEmail;
  if (!recipientEmail) {
    throw new CompletionError("Customer email missing on shipment.");
  }

  const docType = shipment.holdedDocType as "waybill" | "salesorder";
  const docId = shipment.holdedDocumentId;
  const mailTemplateId = getMailTemplateId();

  try {
    const sendRes = await holded.sendDocument({
      docType,
      documentId: docId,
      payload: {
        emails: recipientEmail,
        ...(mailTemplateId ? { mailTemplateId } : {}),
      },
    });

    auditLog("EMAIL_RESENT", shipmentId, docType, docId, {
      recipientEmail,
      response: sendRes,
    });

    const now = new Date();
    return await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: "COMPLETED",
        completedAt: shipment.completedAt ?? now,
        holdedEmailSentAt: now,
        holdedEmailStatus: "SENT",
        holdedEmailError: null,
      },
    });
  } catch (error) {
    const errorMsg =
      error instanceof HoldedApiError
        ? `Holded API ${error.statusCode}: ${error.responseBody}`
        : error instanceof Error
          ? error.message
          : String(error);

    auditLog("EMAIL_RESEND_FAILED", shipmentId, docType, docId, {
      recipientEmail,
      error: errorMsg,
    });

    await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        holdedEmailStatus: "ERROR",
        holdedEmailError: errorMsg,
      },
    });

    throw new CompletionError(`Failed to resend email: ${errorMsg}`);
  }
}

export class CompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompletionError";
  }
}
