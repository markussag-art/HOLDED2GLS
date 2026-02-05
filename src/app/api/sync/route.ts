import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { fetchAllPendingDocuments, getContact } from "@/lib/holded";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings();

  if (!settings.holdedApiKey) {
    return NextResponse.json(
      { error: "Holded API key not configured. Go to Settings." },
      { status: 400 }
    );
  }

  const docType = settings.holdedDocType || "waybill";

  try {
    const documents = await fetchAllPendingDocuments(settings.holdedApiKey, docType);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const doc of documents) {
      try {
        // Check if we already have this document
        const existing = await prisma.shipment.findUnique({
          where: {
            holdedDocId_holdedDocType: {
              holdedDocId: doc.id,
              holdedDocType: docType,
            },
          },
        });

        // If it already exists and has a label, skip (don't overwrite)
        if (existing && (existing.localStatus === "Labeled" || existing.localStatus === "Shipped")) {
          skipped++;
          continue;
        }

        // Fetch contact details for shipping address
        let contactData: {
          name?: string;
          tradeName?: string;
          email?: string;
          phone?: string;
          mobile?: string;
          shippingAddress?: string;
          shippingCity?: string;
          shippingProvince?: string;
          shippingPostalCode?: string;
          shippingCountry?: string;
          shippingCountryCode?: string;
        } = {};

        if (doc.contact) {
          try {
            const contact = await getContact(settings.holdedApiKey, doc.contact);
            const shipAddr =
              contact.shippingAddresses && contact.shippingAddresses.length > 0
                ? contact.shippingAddresses[0]
                : null;

            contactData = {
              name: contact.name || "",
              tradeName: contact.tradeName || "",
              email: contact.email || "",
              phone: contact.phone || contact.mobile || "",
              mobile: contact.mobile || "",
              shippingAddress: shipAddr?.address || contact.billAddress?.address || "",
              shippingCity: shipAddr?.city || contact.billAddress?.city || "",
              shippingProvince: shipAddr?.province || contact.billAddress?.province || "",
              shippingPostalCode: String(shipAddr?.postalCode || contact.billAddress?.postalCode || ""),
              shippingCountry: shipAddr?.country || contact.billAddress?.country || "ES",
              shippingCountryCode: shipAddr?.countryCode || contact.billAddress?.countryCode || "ES",
            };
          } catch (contactErr) {
            // Non-fatal: proceed without contact details
            console.error(`Failed to fetch contact ${doc.contact}:`, contactErr);
          }
        }

        // Calculate total weight from products if available
        let totalWeight = 0;
        if (doc.products && Array.isArray(doc.products)) {
          for (const item of doc.products) {
            if (item.weight) {
              totalWeight += item.weight * (item.units || 1);
            }
          }
        }

        // Use document-level shipping address if available, otherwise use contact's
        const shipmentData = {
          holdedDocType: docType,
          holdedDocId: doc.id,
          holdedDocNumber: doc.docNumber || String(doc.id),
          holdedStatusRaw: String(doc.status ?? ""),
          holdedContactId: doc.contact || "",
          holdedSyncedAt: new Date(),
          recipientName: doc.contactName || contactData.name || "",
          recipientCompany: contactData.tradeName || doc.contactName || "",
          recipientPhone: contactData.phone || contactData.mobile || "",
          recipientEmail: contactData.email || "",
          address1: doc.shippingAddress || contactData.shippingAddress || "",
          city: doc.shippingCity || contactData.shippingCity || "",
          province: doc.shippingProvince || contactData.shippingProvince || "",
          postcode: doc.shippingPostalCode || contactData.shippingPostalCode || "",
          country: doc.shippingCountry || contactData.shippingCountry || "ES",
          countryCode: contactData.shippingCountryCode || "ES",
          totalWeightKg: totalWeight,
          docTotal: doc.total || 0,
          docCurrency: doc.currency || "EUR",
          shippingNotes: doc.notes || doc.desc || "",
          orderReference: doc.docNumber || "",
          serviceType: settings.glsDefaultService || "BusinessParcel",
        };

        if (existing) {
          // Update existing pending shipment with fresh data
          await prisma.shipment.update({
            where: { id: existing.id },
            data: {
              ...shipmentData,
              // Keep user-modified fields
              parcelsCount: existing.parcelsCount || 1,
              totalWeightKg: existing.totalWeightKg || shipmentData.totalWeightKg,
              localStatus: existing.localStatus === "Error" ? "Pending" : existing.localStatus,
            },
          });
          updated++;
        } else {
          await prisma.shipment.create({ data: shipmentData });
          created++;
        }

        // Audit log
        await prisma.auditLog.create({
          data: {
            action: "sync",
            details: JSON.stringify({
              holdedDocId: doc.id,
              docNumber: doc.docNumber,
              action: existing ? "updated" : "created",
            }),
            userId: (session.user as { id?: string }).id || null,
          },
        });
      } catch (docErr) {
        errors.push(`Doc ${doc.docNumber || doc.id}: ${docErr instanceof Error ? docErr.message : String(docErr)}`);
      }
    }

    return NextResponse.json({
      success: true,
      total: documents.length,
      created,
      updated,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}
