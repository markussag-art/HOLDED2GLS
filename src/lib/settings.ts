import { prisma } from "./prisma";
import { encrypt, decrypt } from "./encryption";

// Fields that are encrypted at rest
const ENCRYPTED_FIELDS = ["holdedApiKey", "glsUsername", "glsPassword"];

export async function getSettings() {
  let settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!settings) {
    settings = await prisma.settings.create({ data: { id: "singleton" } });
  }
  return settings;
}

export async function getDecryptedSettings() {
  const settings = await getSettings();
  return {
    ...settings,
    holdedApiKey: decrypt(settings.holdedApiKey),
    glsUsername: decrypt(settings.glsUsername),
    glsPassword: decrypt(settings.glsPassword),
  };
}

export async function updateSettings(data: Record<string, unknown>) {
  const updateData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (ENCRYPTED_FIELDS.includes(key) && typeof value === "string") {
      updateData[key] = value ? encrypt(value) : "";
    } else {
      updateData[key] = value;
    }
  }

  return prisma.settings.upsert({
    where: { id: "singleton" },
    update: updateData,
    create: { id: "singleton", ...updateData },
  });
}

export function getGlsCredentials(settings: {
  glsUsername: string;
  glsPassword: string;
  glsContactId: string;
  glsBaseUrl: string;
}) {
  return {
    username: settings.glsUsername,
    password: settings.glsPassword,
    contactId: settings.glsContactId,
    baseUrl: settings.glsBaseUrl,
  };
}
