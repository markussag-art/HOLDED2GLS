import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const shipment = await prisma.shipment.findUnique({ where: { id } });
  if (!shipment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (shipment.localStatus !== "Labeled") {
    return NextResponse.json(
      { error: "Only labeled shipments can be marked as shipped." },
      { status: 400 }
    );
  }

  const updated = await prisma.shipment.update({
    where: { id },
    data: {
      localStatus: "Shipped",
      shippedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "shipped",
      details: JSON.stringify({
        shipmentId: id,
        trackingNumber: shipment.trackingNumber,
      }),
      userId: (session.user as { id?: string }).id || null,
      shipmentId: id,
    },
  });

  return NextResponse.json({ success: true, shipment: updated });
}
