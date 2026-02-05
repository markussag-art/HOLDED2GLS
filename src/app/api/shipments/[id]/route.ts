import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const shipment = await prisma.shipment.findUnique({ where: { id } });
  if (!shipment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(shipment);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const editableFields = [
    "recipientName",
    "recipientCompany",
    "recipientPhone",
    "recipientEmail",
    "address1",
    "address2",
    "city",
    "province",
    "postcode",
    "country",
    "countryCode",
    "parcelsCount",
    "totalWeightKg",
    "parcelWeights",
    "serviceType",
    "serviceCode",
    "orderReference",
    "customerReference",
    "shippingNotes",
    "carrier",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of editableFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  const shipment = await prisma.shipment.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json(shipment);
}
