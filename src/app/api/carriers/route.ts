import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCarrierAdapter, listCarriers } from "@/carriers";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const carriers = listCarriers().map((name) => {
    const adapter = getCarrierAdapter(name);
    return {
      name,
      services: adapter.getServiceTypes(),
    };
  });

  return NextResponse.json(carriers);
}
