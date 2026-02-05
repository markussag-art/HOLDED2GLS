import type { CarrierAdapter } from "./types";
import { GLSAdapter } from "./gls";

const adapters: Record<string, CarrierAdapter> = {
  GLS: new GLSAdapter(),
  // MRW: new MRWAdapter(), // Future: add MRW adapter here
};

export function getCarrierAdapter(carrier: string): CarrierAdapter {
  const adapter = adapters[carrier];
  if (!adapter) {
    throw new Error(`Unknown carrier: ${carrier}. Available: ${Object.keys(adapters).join(", ")}`);
  }
  return adapter;
}

export function listCarriers(): string[] {
  return Object.keys(adapters);
}

export type { CarrierAdapter, CreateShipmentPayload, CreateShipmentResult } from "./types";
