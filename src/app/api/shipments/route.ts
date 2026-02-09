import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { CreateShipmentInput } from "@/types/shipment";

/** GET /api/shipments — list all shipments */
export async function GET() {
  const shipments = await prisma.shipment.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(shipments);
}

/** POST /api/shipments — create a new shipment */
export async function POST(request: NextRequest) {
  let body: CreateShipmentInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.holdedDocType || !body.holdedDocumentId || !body.carrier) {
    return NextResponse.json(
      { error: "holdedDocType, holdedDocumentId, and carrier are required" },
      { status: 400 }
    );
  }

  if (!["GLS", "MRW"].includes(body.carrier)) {
    return NextResponse.json(
      { error: 'carrier must be "GLS" or "MRW"' },
      { status: 400 }
    );
  }

  const shipment = await prisma.shipment.create({
    data: {
      holdedDocType: body.holdedDocType,
      holdedDocumentId: body.holdedDocumentId,
      carrier: body.carrier,
      recipientName: body.recipientName,
      recipientAddress: body.recipientAddress,
      recipientCity: body.recipientCity,
      recipientPostalCode: body.recipientPostalCode,
      recipientCountry: body.recipientCountry ?? "ES",
      recipientPhone: body.recipientPhone,
      recipientEmail: body.recipientEmail,
      recipientProvince: body.recipientProvince,
      weight: body.weight,
      packages: body.packages ?? 1,
      reference: body.reference,
    },
  });

  return NextResponse.json(shipment, { status: 201 });
}
