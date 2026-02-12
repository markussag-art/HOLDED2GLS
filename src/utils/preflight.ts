/**
 * Preflight validator — validates shipment data before calling GLS.
 *
 * Checks all required fields and country-specific constraints.
 * Returns a list of human-readable issues. Empty list = all OK.
 */

import { Shipment, SHIPPING_METHODS } from '../models/shipment';

export interface PreflightIssue {
  field: string;
  message: string;
}

export function runPreflight(shipment: Shipment): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  // Recipient
  if (!shipment.recipientName && !shipment.recipientCommercialName) {
    issues.push({ field: 'recipientName', message: 'Recipient name or commercial name is required' });
  }
  if (!shipment.recipientAddress) {
    issues.push({ field: 'recipientAddress', message: 'Recipient address is required' });
  }
  if (!shipment.recipientCity) {
    issues.push({ field: 'recipientCity', message: 'Recipient city is required' });
  }
  if (!shipment.recipientPostcode) {
    issues.push({ field: 'recipientPostcode', message: 'Recipient postcode is required' });
  }
  if (!shipment.recipientCountry) {
    issues.push({ field: 'recipientCountry', message: 'Recipient country is required' });
  }
  if (!shipment.recipientPhone) {
    issues.push({ field: 'recipientPhone', message: 'Recipient phone is required for GLS delivery' });
  }

  // Country-specific
  const country = (shipment.recipientCountry || '').toUpperCase();
  if (country && country !== 'ES' && country !== 'PT') {
    issues.push({ field: 'recipientCountry', message: `Tracking URL generation only supports ES and PT, got: ${country}` });
  }

  if (country === 'ES') {
    const digits = (shipment.recipientPostcode || '').replace(/\D/g, '');
    if (digits.length !== 5) {
      issues.push({ field: 'recipientPostcode', message: 'Spain postcode must be exactly 5 digits' });
    }
  }

  // Shipment parameters
  if (!shipment.weight || shipment.weight <= 0) {
    issues.push({ field: 'weight', message: 'Weight must be greater than 0' });
  }
  if (!shipment.packages || shipment.packages <= 0) {
    issues.push({ field: 'packages', message: 'Packages count must be at least 1' });
  }

  // Shipping method
  if (!shipment.shippingMethod) {
    issues.push({ field: 'shippingMethod', message: 'Shipping method is required' });
  } else {
    const valid = SHIPPING_METHODS.find(m => m.code === shipment.shippingMethod);
    if (!valid) {
      issues.push({ field: 'shippingMethod', message: `Unknown shipping method: ${shipment.shippingMethod}` });
    }
  }

  return issues;
}
