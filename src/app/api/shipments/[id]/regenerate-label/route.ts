import { NextRequest, NextResponse } from "next/server";
import { regenerateLabel } from "@/services/tracking-sync";

/** POST /api/shipments/:id/regenerate-label — regenerate label with new tracking, sync to Holded */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const shipment = await regenerateLabel(id);
    return NextResponse.json(shipment);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("currently being processed")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
