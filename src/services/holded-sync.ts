/**
 * Service for syncing pending waybill documents from Holded into local DB.
 *
 * Fetches all waybill documents from Holded, enriches with contact details,
 * and creates local Shipment records for any not already imported.
 */

import { prisma } from "@/lib/prisma";
import { holded } from "@/services/holded";
import type { HoldedDocument, HoldedContact } from "@/types/holded";
import type { Shipment } from "@/generated/prisma/client";

export interface SyncResult {
  imported: number;
  skipped: number;
  total: number;
  errors: string[];
  shipments: Shipment[];
}

/**
 * Fetch pending waybills from Holded and import new ones into local DB.
 * For each new document, also fetches the contact to get address/phone/email.
 */
export async function syncPendingWaybills(): Promise<SyncResult> {
  const result: SyncResult = {
    imported: 0,
    skipped: 0,
    total: 0,
    errors: [],
    shipments: [],
  };

  // Fetch all waybill documents from Holded (paginate)
  let allDocs: HoldedDocument[] = [];
  let page = 1;
  const maxPages = 20;

  while (page <= maxPages) {
    try {
      const docs = await holded.listDocuments({
        docType: "waybill",
        page,
      });

      if (!Array.isArray(docs) || docs.length === 0) {
        break;
      }

      allDocs = allDocs.concat(docs);
      page++;

      if (docs.length < 50) break;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to fetch page ${page}: ${msg}`);
      break;
    }
  }

  result.total = allDocs.length;

  // Get existing holdedDocumentIds to detect duplicates
  const existingIds = new Set(
    (
      await prisma.shipment.findMany({
        select: { holdedDocumentId: true },
      })
    ).map((s) => s.holdedDocumentId)
  );

  // Cache contacts to avoid re-fetching for same contact across docs
  const contactCache = new Map<string, HoldedContact | null>();

  for (const doc of allDocs) {
    if (!doc.id) {
      result.errors.push("Document without ID found, skipping.");
      result.skipped++;
      continue;
    }

    if (existingIds.has(doc.id)) {
      result.skipped++;
      continue;
    }

    try {
      // Fetch contact details if available
      let contact: HoldedContact | null = null;
      if (doc.contact) {
        if (contactCache.has(doc.contact)) {
          contact = contactCache.get(doc.contact) ?? null;
        } else {
          try {
            contact = await holded.getContact(doc.contact);
            contactCache.set(doc.contact, contact);
          } catch (e) {
            console.warn(`[SYNC] Failed to fetch contact ${doc.contact}:`, e);
            contactCache.set(doc.contact, null);
          }
        }
      }

      const shipment = await importHoldedDocument(doc, contact);
      result.shipments.push(shipment);
      result.imported++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to import doc ${doc.docNumber ?? doc.id}: ${msg}`);
    }
  }

  return result;
}

/**
 * Map a Holded document + contact to a local Shipment record.
 * Uses shipping address from contact if available, falls back to billing address.
 */
async function importHoldedDocument(
  doc: HoldedDocument,
  contact: HoldedContact | null
): Promise<Shipment> {
  // Calculate total weight from products
  const totalWeight = (doc.products ?? []).reduce(
    (sum, p) => sum + ((p.weight ?? 0) * (p.units ?? 1)),
    0
  );
  const totalPackages = (doc.products ?? []).reduce(
    (sum, p) => sum + (p.units ?? 0),
    0
  );

  // Resolve address: shipping address > billing address > document fields
  let address = "";
  let city = "";
  let postalCode = "";
  let province = "";
  let country = "ES";

  if (contact) {
    // Check shipping addresses first
    const shippingAddr = contact.shippingAddresses?.[0];
    if (shippingAddr?.address) {
      address = shippingAddr.address ?? "";
      city = shippingAddr.city ?? "";
      postalCode = shippingAddr.postalCode ?? "";
      province = shippingAddr.province ?? "";
      country = shippingAddr.countryCode ?? shippingAddr.country ?? "ES";
    } else if (contact.billAddress) {
      address = contact.billAddress.address ?? "";
      city = contact.billAddress.city ?? "";
      postalCode = contact.billAddress.postalCode ?? "";
      province = contact.billAddress.province ?? "";
      country =
        contact.billAddress.countryCode ?? contact.billAddress.country ?? "ES";
    }
  }

  // Fall back to document-level fields
  if (!address) address = doc.shippingAddress ?? doc.contactAddress ?? "";
  if (!city) city = doc.shippingCity ?? doc.contactCity ?? "";
  if (!postalCode) postalCode = doc.shippingPostalCode ?? doc.contactCp ?? "";
  if (!province) province = doc.shippingProvince ?? doc.contactProvince ?? "";
  if (country === "ES" && doc.shippingCountry) country = doc.shippingCountry;

  // Resolve phone/email from contact
  const phone = contact?.phone ?? contact?.mobile ?? null;
  const email = contact?.email ?? doc.contactEmail ?? null;
  const name = doc.contactName ?? contact?.name ?? null;

  // Warn about missing critical fields
  const warnings: string[] = [];
  if (!name) warnings.push("name");
  if (!address) warnings.push("address");
  if (!postalCode) warnings.push("postal code");
  if (!city) warnings.push("city");
  if (!phone) warnings.push("phone");
  if (!email) warnings.push("email");

  if (warnings.length > 0) {
    console.warn(
      `[SYNC] Document ${doc.docNumber ?? doc.id} missing: ${warnings.join(", ")}`
    );
  }

  return prisma.shipment.create({
    data: {
      holdedDocType: "waybill",
      holdedDocumentId: doc.id,
      holdedDocNumber: doc.docNumber ?? null,
      holdedContactId: doc.contact ?? null,
      holdedNotes: doc.notes ?? null,
      carrier: "GLS",
      recipientName: name,
      recipientAddress: address || null,
      recipientCity: city || null,
      recipientPostalCode: postalCode || null,
      recipientProvince: province || null,
      recipientCountry: country || "ES",
      recipientPhone: phone,
      recipientEmail: email,
      weight: totalWeight > 0 ? totalWeight : null,
      packages: totalPackages > 0 ? totalPackages : 1,
      reference: doc.docNumber ?? null,
    },
  });
}
