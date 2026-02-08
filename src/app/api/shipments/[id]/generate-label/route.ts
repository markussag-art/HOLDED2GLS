import { NextRequest, NextResponse } from "next/server";
import { generateLabel } from "@/services/tracking-sync";

/** POST /api/shipments/:id/generate-label — generate GLS label and sync to Holded */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const shipment = await generateLabel(id);
    return NextResponse.json(shipment);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("currently being processed")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes("already has an active tracking")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
