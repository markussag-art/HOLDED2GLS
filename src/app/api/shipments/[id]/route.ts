import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/shipments/:id — get a single shipment */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const shipment = await prisma.shipment.findUnique({
    where: { id },
  });

  if (!shipment) {
    return NextResponse.json(
      { error: "Shipment not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(shipment);
}
