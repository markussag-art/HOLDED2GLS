import { NextRequest, NextResponse } from "next/server";
import { completeAndEmail, CompletionError } from "@/services/completion";

/** POST /api/shipments/:id/complete — mark as Completed in Holded + send email */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const shipment = await completeAndEmail(id);
    return NextResponse.json(shipment);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      error instanceof CompletionError &&
      (message.includes("Cannot complete") ||
        message.includes("Already completed") ||
        message.includes("Customer email missing") ||
        message.includes("not linked"))
    ) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    // Partial failure: Holded completed but email failed
    if (message.includes("email sending failed")) {
      return NextResponse.json({ error: message }, { status: 502 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
