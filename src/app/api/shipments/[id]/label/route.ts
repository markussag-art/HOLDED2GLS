import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDecryptedSettings, getGlsCredentials } from "@/lib/settings";
import { getCarrierAdapter } from "@/carriers";
import type { CreateShipmentPayload, ParcelInfo } from "@/carriers/types";
import fs from "fs/promises";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const regenerate = body?.regenerate === true;

  const shipment = await prisma.shipment.findUnique({ where: { id } });
  if (!shipment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Idempotency check: prevent duplicate label unless regenerate flag is set
  if (shipment.localStatus === "Labeled" && shipment.trackingNumber && !regenerate) {
    return NextResponse.json(
      { error: "Label already generated. Use regenerate=true to create a new one." },
      { status: 409 }
    );
  }

  // Validate required fields
  if (!shipment.address1 || !shipment.city || !shipment.postcode) {
    return NextResponse.json(
      { error: "Incomplete address: street, city, and postal code are required." },
      { status: 400 }
    );
  }
  if (!shipment.recipientName && !shipment.recipientCompany) {
    return NextResponse.json(
      { error: "Recipient name or company is required." },
      { status: 400 }
    );
  }
  if (shipment.totalWeightKg <= 0) {
    return NextResponse.json(
      { error: "Total weight must be greater than 0." },
      { status: 400 }
    );
  }
  if (shipment.parcelsCount < 1) {
    return NextResponse.json(
      { error: "At least 1 parcel is required." },
      { status: 400 }
    );
  }

  const settings = await getDecryptedSettings();
  const carrier = shipment.carrier || "GLS";
  const adapter = getCarrierAdapter(carrier);

  // Build parcels
  let parcelWeights: number[] = [];
  try {
    parcelWeights = JSON.parse(shipment.parcelWeights || "[]");
  } catch {
    parcelWeights = [];
  }

  const parcels: ParcelInfo[] = [];
  if (parcelWeights.length === shipment.parcelsCount) {
    for (const w of parcelWeights) {
      parcels.push({ weight: w, reference: shipment.orderReference });
    }
  } else {
    // Split weight evenly
    const perParcel = shipment.totalWeightKg / shipment.parcelsCount;
    for (let i = 0; i < shipment.parcelsCount; i++) {
      parcels.push({
        weight: Math.round(perParcel * 100) / 100,
        reference: shipment.orderReference,
      });
    }
  }

  const payload: CreateShipmentPayload = {
    sender: {
      name: settings.senderName,
      company: settings.senderName,
      street: settings.senderAddress,
      city: settings.senderCity,
      province: settings.senderProvince,
      postalCode: settings.senderPostalCode,
      country: settings.senderCountry,
      countryCode: settings.senderCountryCode,
      phone: settings.senderPhone,
      email: settings.senderEmail,
    },
    recipient: {
      name: shipment.recipientName,
      company: shipment.recipientCompany,
      street: shipment.address1,
      street2: shipment.address2,
      city: shipment.city,
      province: shipment.province,
      postalCode: shipment.postcode,
      country: shipment.country,
      countryCode: shipment.countryCode,
      phone: shipment.recipientPhone,
      email: shipment.recipientEmail,
    },
    parcels,
    serviceType: shipment.serviceType,
    serviceCode: shipment.serviceCode || shipment.serviceType,
    reference: shipment.orderReference,
    customerReference: shipment.customerReference,
    notes: shipment.shippingNotes,
  };

  // Get credentials for the carrier
  let credentials: Record<string, string>;
  if (carrier === "GLS") {
    credentials = getGlsCredentials(settings);
  } else {
    return NextResponse.json({ error: `Carrier ${carrier} not yet configured` }, { status: 400 });
  }

  // If regenerating, cancel the existing shipment first
  if (regenerate && shipment.trackingNumber) {
    try {
      await adapter.cancelShipment(shipment.trackingNumber, credentials);
    } catch {
      // Non-fatal: proceed with new label
    }
  }

  const result = await adapter.createShipment(payload, credentials);

  if (!result.success) {
    // Update shipment with error
    await prisma.shipment.update({
      where: { id },
      data: {
        localStatus: "Error",
        errorMessage: result.errorMessage || "Unknown error",
        labelRawResponse: JSON.stringify(result.rawResponse).substring(0, 10000),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "error",
        details: JSON.stringify({
          shipmentId: id,
          error: result.errorMessage,
        }),
        userId: (session.user as { id?: string }).id || null,
        shipmentId: id,
      },
    });

    return NextResponse.json(
      { error: result.errorMessage, rawResponse: result.rawResponse },
      { status: 422 }
    );
  }

  // Save label PDF to disk
  let labelPdfPath = "";
  if (result.labelPdfBase64) {
    const labelsDir = path.join(process.cwd(), "storage", "labels");
    await fs.mkdir(labelsDir, { recursive: true });
    const filename = `${shipment.holdedDocNumber}_${result.trackingNumber}_${Date.now()}.pdf`;
    labelPdfPath = path.join("storage", "labels", filename);
    await fs.writeFile(
      path.join(process.cwd(), labelPdfPath),
      Buffer.from(result.labelPdfBase64, "base64")
    );
  }

  // Update shipment
  const updated = await prisma.shipment.update({
    where: { id },
    data: {
      localStatus: "Labeled",
      trackingNumber: result.trackingNumber,
      labelPdfPath,
      labelRawResponse: JSON.stringify(result.rawResponse).substring(0, 10000),
      labelGeneratedAt: new Date(),
      errorMessage: "",
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "label_generated",
      details: JSON.stringify({
        shipmentId: id,
        trackingNumber: result.trackingNumber,
        carrier,
        regenerate,
      }),
      userId: (session.user as { id?: string }).id || null,
      shipmentId: id,
    },
  });

  return NextResponse.json({
    success: true,
    trackingNumber: result.trackingNumber,
    labelPdfPath,
    shipment: updated,
  });
}

// GET: Download label PDF
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const shipment = await prisma.shipment.findUnique({ where: { id } });
  if (!shipment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!shipment.labelPdfPath) {
    return NextResponse.json({ error: "No label available" }, { status: 404 });
  }

  try {
    const filePath = path.join(process.cwd(), shipment.labelPdfPath);
    const pdfBuffer = await fs.readFile(filePath);

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${shipment.holdedDocNumber}_label.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Label file not found on disk" }, { status: 404 });
  }
}
