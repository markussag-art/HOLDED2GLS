import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/shipments/bulk-labels
 *
 * Accepts { ids: string[] } and returns a JSON array of { id, reference, labelData }
 * for all matching shipments that have labels.
 *
 * The client assembles these into a downloadable format (multi-page PDF or ZIP).
 */
export async function POST(request: NextRequest) {
  let body: { ids: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json(
      { error: "ids must be a non-empty array" },
      { status: 400 }
    );
  }

  const shipments = await prisma.shipment.findMany({
    where: {
      id: { in: body.ids },
      labelData: { not: null },
    },
    select: {
      id: true,
      reference: true,
      trackingNumber: true,
      labelData: true,
    },
  });

  if (shipments.length === 0) {
    return NextResponse.json(
      { error: "No labels found for selected shipments" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    labels: shipments.map((s) => ({
      id: s.id,
      reference: s.reference ?? s.trackingNumber ?? s.id.slice(0, 8),
      trackingNumber: s.trackingNumber,
      labelData: s.labelData,
    })),
  });
}
