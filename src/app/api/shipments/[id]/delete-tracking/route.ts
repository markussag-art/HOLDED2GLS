import { NextRequest, NextResponse } from "next/server";
import { deleteTracking } from "@/services/tracking-sync";

/** POST /api/shipments/:id/delete-tracking — delete tracking and clear from Holded */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const shipment = await deleteTracking(id);
    return NextResponse.json(shipment);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("currently being processed")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes("no tracking number")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
