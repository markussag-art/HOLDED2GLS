import { NextResponse } from "next/server";
import { syncPendingWaybills } from "@/services/holded-sync";

/** POST /api/shipments/sync-pending — fetch pending waybills from Holded and import them */
export async function POST() {
  try {
    const result = await syncPendingWaybills();

    return NextResponse.json({
      imported: result.imported,
      skipped: result.skipped,
      total: result.total,
      errors: result.errors,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Sync failed: ${msg}` },
      { status: 500 }
    );
  }
}
