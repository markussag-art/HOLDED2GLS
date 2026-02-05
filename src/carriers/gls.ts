import type {
  CarrierAdapter,
  CreateShipmentPayload,
  CreateShipmentResult,
  CancelShipmentResult,
} from "./types";

const GLS_SERVICE_TYPES = [
  {
    code: "BusinessParcel",
    name: "Business Parcel",
    description: "Domestic 24-48h (mainland); up to 24-72h islands/territories",
    international: false,
  },
  {
    code: "EconomyParcel",
    name: "Economy Parcel",
    description: "Domestic 48-72h economy service",
    international: false,
  },
  {
    code: "EuroBusinessParcel",
    name: "Euro Business Parcel",
    description: "International Europe 24-96h depending on destination",
    international: true,
  },
  {
    code: "EuroBusinessSmallParcel",
    name: "Euro Business Small Parcel",
    description: "International Europe small parcel service",
    international: true,
  },
  {
    code: "service_guaranteed24",
    name: "Guaranteed 24h",
    description: "Next-day guaranteed delivery",
    international: false,
  },
  {
    code: "service_0800",
    name: "Before 08:30",
    description: "Next-day delivery before 08:30",
    international: false,
  },
  {
    code: "service_0900",
    name: "Before 09:00",
    description: "Next-day delivery before 09:00",
    international: false,
  },
  {
    code: "service_1000",
    name: "Before 10:30",
    description: "Next-day delivery before 10:30",
    international: false,
  },
  {
    code: "service_1200",
    name: "Before 14:00",
    description: "Next-day delivery before 14:00",
    international: false,
  },
  {
    code: "service_saturday_1000",
    name: "Saturday before 10:30",
    description: "Saturday delivery before 10:30",
    international: false,
  },
  {
    code: "service_saturday_1200",
    name: "Saturday before 14:00",
    description: "Saturday delivery before 14:00",
    international: false,
  },
  {
    code: "service_Saturday",
    name: "Saturday Delivery",
    description: "Saturday delivery service",
    international: false,
  },
];

// Map friendly service codes to GLS Product values
function mapServiceToProduct(serviceCode: string): {
  product: string;
  services: Array<{ ServiceName: string }>;
} {
  // Time-definite services use PARCEL product + additional service
  const timeServices = [
    "service_guaranteed24",
    "service_0800",
    "service_0900",
    "service_1000",
    "service_1200",
    "service_saturday_1000",
    "service_saturday_1200",
    "service_Saturday",
  ];

  if (timeServices.includes(serviceCode)) {
    return {
      product: "PARCEL",
      services: [{ ServiceName: serviceCode }],
    };
  }

  // Euro services
  if (
    serviceCode === "EuroBusinessParcel" ||
    serviceCode === "EuroBusinessSmallParcel"
  ) {
    return { product: "PARCEL", services: [] };
  }

  // Default domestic
  return { product: "PARCEL", services: [] };
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (attempt === retries) throw error;
      const delay = Math.pow(2, attempt + 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

function buildAuthHeader(username: string, password: string): string {
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

export class GLSAdapter implements CarrierAdapter {
  readonly carrierName = "GLS";

  getServiceTypes() {
    return GLS_SERVICE_TYPES;
  }

  async createShipment(
    payload: CreateShipmentPayload,
    credentials: Record<string, string>
  ): Promise<CreateShipmentResult> {
    const { username, password, contactId, baseUrl } = credentials;

    if (!username || !password || !contactId) {
      return {
        success: false,
        trackingNumber: "",
        rawResponse: {},
        errorMessage: "GLS credentials not configured. Set them in Settings.",
      };
    }

    const { product, services } = mapServiceToProduct(payload.serviceCode || payload.serviceType);

    // Build shipment units (one per parcel)
    const shipmentUnits = payload.parcels.map((parcel, index) => {
      const unit: Record<string, unknown> = {
        Weight: parcel.weight,
      };

      if (services.length > 0) {
        unit.Service = services;
      }

      if (parcel.reference) {
        unit.ShipmentUnitReference = [parcel.reference];
      }

      return unit;
    });

    const requestBody = {
      Shipment: {
        Product: product,
        Consignee: {
          ConsigneeID: "",
          Name1: payload.recipient.name || payload.recipient.company || "",
          Name2: payload.recipient.company || "",
          Street: payload.recipient.street,
          StreetNumber: "",
          ZIPCode: payload.recipient.postalCode,
          City: payload.recipient.city,
          Province: payload.recipient.province || "",
          CountryCode: payload.recipient.countryCode || "ES",
          ContactPerson: payload.recipient.contactPerson || payload.recipient.name || "",
          FixedLinePhonenumber: payload.recipient.phone || "",
          MobilePhoneNumber: payload.recipient.phone || "",
          eMail: payload.recipient.email || "",
          Category: "BUSINESS",
        },
        Shipper: {
          ContactID: contactId,
          AlternativeShipperAddress: {
            Name1: payload.sender.name || "",
            Name2: payload.sender.company || "",
            Street: payload.sender.street,
            StreetNumber: "",
            ZIPCode: payload.sender.postalCode,
            City: payload.sender.city,
            Province: payload.sender.province || "",
            CountryCode: payload.sender.countryCode || "ES",
            FixedLinePhonenumber: payload.sender.phone || "",
            eMail: payload.sender.email || "",
          },
        },
        ShipmentUnit: shipmentUnits,
        ShipmentReference: [
          payload.reference || "",
          payload.customerReference || "",
        ].filter(Boolean),
        ShippingDate: payload.shippingDate || new Date().toISOString().split("T")[0],
        IncotermCode: "10",
        Middleware: "HOLDED2GLS",
      },
      PrintingOptions: {
        ReturnLabels: {
          TemplateSet: "NONE",
          LabelFormat: "PDF",
        },
      },
    };

    try {
      const url = `${baseUrl}/shipments`;
      const response = await fetchWithRetry(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: buildAuthHeader(username, password),
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      let responseData: Record<string, unknown>;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }

      if (!response.ok) {
        // Redact credentials from error response
        const sanitized = JSON.parse(
          JSON.stringify(responseData)
            .replace(new RegExp(username, "g"), "[REDACTED]")
            .replace(new RegExp(password, "g"), "[REDACTED]")
        );

        return {
          success: false,
          trackingNumber: "",
          rawResponse: sanitized,
          errorMessage: `GLS API error ${response.status}: ${JSON.stringify(responseData).substring(0, 500)}`,
        };
      }

      // Extract tracking info from response
      const created = responseData.CreatedShipment as Record<string, unknown> | undefined;
      const parcels = (created?.ParcelData as Array<Record<string, unknown>>) || [];
      const trackingNumbers = parcels.map((p) => p.TrackID as string).filter(Boolean);
      const primaryTracking = trackingNumbers[0] || "";

      // Extract label PDF (base64)
      let labelPdfBase64 = "";
      const printData = (created?.PrintData as Array<Record<string, unknown>>) || [];
      if (printData.length > 0) {
        labelPdfBase64 = (printData[0]?.Data as string) || "";
      }

      // Redact credentials from stored response
      const sanitizedResponse = JSON.parse(
        JSON.stringify(responseData)
          .replace(new RegExp(username, "g"), "[REDACTED]")
          .replace(new RegExp(password, "g"), "[REDACTED]")
      );

      return {
        success: true,
        trackingNumber: primaryTracking,
        labelPdfBase64,
        parcelNumbers: trackingNumbers,
        rawResponse: sanitizedResponse,
      };
    } catch (error) {
      return {
        success: false,
        trackingNumber: "",
        rawResponse: {},
        errorMessage: `GLS connection error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async cancelShipment(
    trackingNumber: string,
    credentials: Record<string, string>
  ): Promise<CancelShipmentResult> {
    const { username, password, baseUrl } = credentials;

    try {
      const url = `${baseUrl}/shipments/cancel/${trackingNumber}`;
      const response = await fetchWithRetry(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: buildAuthHeader(username, password),
        },
      });

      const responseText = await response.text();
      let responseData: Record<string, unknown>;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }

      if (!response.ok) {
        return {
          success: false,
          rawResponse: responseData,
          errorMessage: `GLS cancel error ${response.status}: ${responseText.substring(0, 500)}`,
        };
      }

      return { success: true, rawResponse: responseData };
    } catch (error) {
      return {
        success: false,
        rawResponse: {},
        errorMessage: `GLS cancel connection error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async getLabel(
    trackingNumber: string,
    credentials: Record<string, string>
  ): Promise<{ pdfBase64: string } | null> {
    // GLS returns label at creation time; this would be for re-fetching
    // The ShipIT API doesn't have a separate "get label" endpoint - labels are returned at creation
    // For re-printing, we use the stored PDF from our DB
    return null;
  }
}
