import { NextRequest, NextResponse } from "next/server";
import { retrySync } from "@/services/tracking-sync";

/** POST /api/shipments/:id/retry-sync — retry failed Holded sync */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const shipment = await retrySync(id);
    return NextResponse.json(shipment);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("not in error state")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
