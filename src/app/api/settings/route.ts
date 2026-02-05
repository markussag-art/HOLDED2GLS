import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSettings, updateSettings } from "@/lib/settings";
import { decrypt } from "@/lib/encryption";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings();

  // Return settings with masked API keys
  return NextResponse.json({
    ...settings,
    holdedApiKey: settings.holdedApiKey ? "••••••••" : "",
    glsUsername: decrypt(settings.glsUsername) || "",
    glsPassword: settings.glsPassword ? "••••••••" : "",
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Don't update masked values
  const updates: Record<string, unknown> = {};
  const settableFields = [
    "holdedApiKey",
    "holdedDocType",
    "glsUsername",
    "glsPassword",
    "glsContactId",
    "glsBaseUrl",
    "glsDefaultService",
    "senderName",
    "senderCif",
    "senderAddress",
    "senderCity",
    "senderProvince",
    "senderPostalCode",
    "senderCountry",
    "senderCountryCode",
    "senderPhone",
    "senderEmail",
    "autoSyncEnabled",
    "autoSyncMinutes",
  ];

  for (const field of settableFields) {
    if (body[field] !== undefined) {
      // Skip masked passwords
      if (body[field] === "••••••••") continue;
      updates[field] = body[field];
    }
  }

  const updated = await updateSettings(updates);
  return NextResponse.json({
    ...updated,
    holdedApiKey: updated.holdedApiKey ? "••••••••" : "",
    glsUsername: decrypt(updated.glsUsername) || "",
    glsPassword: updated.glsPassword ? "••••••••" : "",
  });
}
