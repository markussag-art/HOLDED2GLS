import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDecryptedSettings, getGlsCredentials } from "@/lib/settings";
import { getCarrierAdapter } from "@/carriers";

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
      { error: "Only labeled shipments can be cancelled." },
      { status: 400 }
    );
  }

  const settings = await getDecryptedSettings();
  const carrier = shipment.carrier || "GLS";
  const adapter = getCarrierAdapter(carrier);

  let credentials: Record<string, string>;
  if (carrier === "GLS") {
    credentials = getGlsCredentials(settings);
  } else {
    return NextResponse.json({ error: `Carrier ${carrier} not configured` }, { status: 400 });
  }

  if (shipment.trackingNumber) {
    const result = await adapter.cancelShipment(shipment.trackingNumber, credentials);
    if (!result.success) {
      return NextResponse.json(
        { error: result.errorMessage || "Cancel failed" },
        { status: 422 }
      );
    }
  }

  const updated = await prisma.shipment.update({
    where: { id },
    data: {
      localStatus: "Pending",
      trackingNumber: "",
      labelPdfPath: "",
      labelRawResponse: "",
      labelGeneratedAt: null,
      cancelledAt: new Date(),
      errorMessage: "",
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "label_cancelled",
      details: JSON.stringify({
        shipmentId: id,
        previousTracking: shipment.trackingNumber,
      }),
      userId: (session.user as { id?: string }).id || null,
      shipmentId: id,
    },
  });

  return NextResponse.json({ success: true, shipment: updated });
}
