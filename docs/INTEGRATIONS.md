# Integration Details: Holded + GLS

## Holded ERP API

### Authentication

- **Method**: API Key in HTTP header
- **Header**: `key: <YOUR_API_KEY>`
- **Base URL**: `https://api.holded.com/api/invoicing/v1`
- **Rate Limiting**: Not documented; paginated at 50 records per page

### Document Types (docType)

| docType | Description |
|---|---|
| `waybill` | Delivery note / shipping doc (albaran) - **primary for shipping** |
| `salesorder` | Sales order |
| `invoice` | Invoice |
| `proform` | Proforma invoice |
| `salesreceipt` | Sales receipt |
| `creditnote` | Credit note |
| `estimate` | Estimate / quote |
| `purchase` | Purchase |
| `purchaseorder` | Purchase order |
| `purchaserefund` | Purchase refund |

The `holdedDocType` is configurable in Settings to support different business workflows.

### Endpoints Used

#### List Documents

```
GET /documents/{docType}?page={n}
```

Query parameters:
- `page` (int): Pagination (default 1)
- `starttmp` / `endtmp`: Date range filter (Unix timestamps)
- `contactid`: Filter by contact
- `paid`: Payment status (0=unpaid, 1=paid, 2=partial)
- `sort`: `created-asc` or `created-desc`

Response (array of documents):
```json
[
  {
    "id": "abc123",
    "docNumber": "ALB-001",
    "date": 1700000000,
    "contact": "contact_id",
    "contactName": "Customer Name",
    "status": 0,
    "total": 150.50,
    "currency": "EUR",
    "notes": "Shipping notes",
    "desc": "Description",
    "shippingAddress": "Calle Example 1",
    "shippingPostalCode": "28001",
    "shippingCity": "Madrid",
    "shippingProvince": "Madrid",
    "shippingCountry": "ES",
    "products": [
      {
        "name": "Product A",
        "units": 2,
        "weight": 1.5,
        "sku": "SKU-001"
      }
    ]
  }
]
```

#### Get Single Document

```
GET /documents/{docType}/{documentId}
```

Returns same fields as list but for a single document.

#### Get Contact

```
GET /contacts/{contactId}
```

Key response fields:
```json
{
  "id": "contact_id",
  "name": "Company Name",
  "tradeName": "Trade Name",
  "code": "B12345678",
  "email": "email@example.com",
  "phone": "+34600000000",
  "mobile": "+34600000000",
  "billAddress": {
    "address": "Billing St 1",
    "city": "Madrid",
    "postalCode": 28001,
    "province": "Madrid",
    "country": "Spain",
    "countryCode": "ES"
  },
  "shippingAddresses": [
    {
      "address": "Shipping St 2",
      "city": "Barcelona",
      "postalCode": 8001,
      "province": "Barcelona",
      "country": "Spain",
      "countryCode": "ES"
    }
  ]
}
```

### Field Mapping: Holded -> Shipment

| Holded Field | Shipment Field | Notes |
|---|---|---|
| `id` | `holdedDocId` | |
| `docNumber` | `holdedDocNumber` | |
| `status` | `holdedStatusRaw` | Integer; meaning varies |
| `contact` | `holdedContactId` | Used to fetch contact details |
| `contactName` | `recipientName` | |
| `shippingAddress` | `address1` | Falls back to contact.shippingAddresses[0] |
| `shippingCity` | `city` | Falls back to contact |
| `shippingProvince` | `province` | Falls back to contact |
| `shippingPostalCode` | `postcode` | Falls back to contact |
| `shippingCountry` | `country` | Falls back to contact |
| `products[].weight * units` | `totalWeightKg` | Summed; user can override |
| `notes` | `shippingNotes` | |
| `total` | `docTotal` | |
| `currency` | `docCurrency` | |

---

## GLS ShipIT REST API

### Authentication

- **Method**: HTTP Basic Authentication
- **Header**: `Authorization: Basic base64(username:password)`
- **Additional Header**: `Requester: <user-name>` (optional, for GDPR compliance)
- **TLS**: Version 1.2 required

### Base URLs

| Environment | URL Pattern |
|---|---|
| Spain Production | `https://shipit-wbm-es01.gls-group.eu:8443/backend/rs` |
| Test/Sandbox | `https://shipit-wbm-test01.gls-group.eu:443/backend/rs` |
| Generic | `https://shipit-wbm-{CC}01.gls-group.eu:8443/backend/rs` |

**Note**: Exact URLs are provided by your GLS representative. The Spain URL above follows the documented pattern but should be confirmed with GLS Spain.

### Endpoints

| Operation | Method | Path |
|---|---|---|
| Create Shipment | POST | `/shipments` |
| Cancel Shipment | POST | `/shipments/cancel/{trackID}` |
| Allowed Services | POST | `/shipments/allowedservices` |
| End of Day | POST | `/shipments/endofday?date=YYYY-MM-DD` |
| Tracking | POST | `/tracking/parcels` |

### Create Shipment Request

```json
{
  "Shipment": {
    "Product": "PARCEL",
    "Consignee": {
      "ConsigneeID": "",
      "Name1": "Recipient Name",
      "Name2": "Company",
      "Street": "Calle Example 1",
      "StreetNumber": "",
      "ZIPCode": "28001",
      "City": "Madrid",
      "Province": "Madrid",
      "CountryCode": "ES",
      "ContactPerson": "John Doe",
      "FixedLinePhonenumber": "+34600000000",
      "MobilePhoneNumber": "+34600000000",
      "eMail": "recipient@example.com",
      "Category": "BUSINESS"
    },
    "Shipper": {
      "ContactID": "YOUR_GLS_CONTACT_ID",
      "AlternativeShipperAddress": {
        "Name1": "Your Company",
        "Street": "Your Street 1",
        "ZIPCode": "08001",
        "City": "Barcelona",
        "CountryCode": "ES"
      }
    },
    "ShipmentUnit": [
      {
        "Weight": 2.5,
        "Service": []
      }
    ],
    "ShipmentReference": ["REF-001"],
    "ShippingDate": "2025-01-15",
    "IncotermCode": "10",
    "Middleware": "HOLDED2GLS"
  },
  "PrintingOptions": {
    "ReturnLabels": {
      "TemplateSet": "NONE",
      "LabelFormat": "PDF"
    }
  }
}
```

### Create Shipment Response

```json
{
  "CreatedShipment": {
    "ParcelData": [
      {
        "TrackID": "12345678901",
        "Barcodes": {
          "Primary2D": "...",
          "Primary1D": "...",
          "Primary1DPrint": "..."
        },
        "RoutingInfo": {
          "Tour": "...",
          "LocationCode": "..."
        }
      }
    ],
    "PrintData": [
      {
        "Data": "base64-encoded-pdf-content...",
        "DocType": "LABEL"
      }
    ],
    "CustomerID": "...",
    "PickupLocation": "..."
  }
}
```

### Product Types & Service Codes

#### Products (GLS `Product` field)

| Value | Use Case |
|---|---|
| `PARCEL` | Standard domestic and most international shipments |
| `EXPRESS` | Express shipments |
| `FREIGHT` | Freight shipments |

#### Service Types (mapped to user-friendly names)

| UI Name | Code / Mapping | Description |
|---|---|---|
| Business Parcel | `BusinessParcel` -> Product=PARCEL | Domestic 24-48h mainland |
| Economy Parcel | `EconomyParcel` -> Product=PARCEL | Domestic 48-72h |
| Euro Business Parcel | `EuroBusinessParcel` -> Product=PARCEL | International EU 24-96h |
| Guaranteed 24h | `service_guaranteed24` -> Service add-on | Next-day guaranteed |
| Before 08:30 | `service_0800` -> Service add-on | Next-day before 08:30 |
| Before 09:00 | `service_0900` -> Service add-on | Next-day before 09:00 |
| Before 10:30 | `service_1000` -> Service add-on | Next-day before 10:30 |
| Before 14:00 | `service_1200` -> Service add-on | Next-day before 14:00 |
| Saturday before 10:30 | `service_saturday_1000` -> Service add-on | Saturday delivery |
| Saturday before 14:00 | `service_saturday_1200` -> Service add-on | Saturday delivery |
| Saturday Delivery | `service_Saturday` -> Service add-on | Saturday delivery |

**Note**: Time-definite and Saturday services are sent as `Service` entries within `ShipmentUnit`, while the `Product` remains `PARCEL`. Availability depends on your GLS contract.

### Label Format

- **PDF**: Base64-encoded in response `PrintData[].Data`
- **ZPL**: For Zebra printers, set `LabelFormat: "ZEBRA"` and `TemplateSet: "ZPL_200"` or `"ZPL_300"`
- **PNG**: Set `LabelFormat: "PNG"`

This application uses PDF format by default.

### Error Handling

GLS returns structured error responses:
```json
{
  "ExceptionItems": [
    {
      "ExitCode": "E001",
      "ExitMessage": "Description of the error",
      "Shipment": { ... }
    }
  ]
}
```

Errors are stored in the shipment record (`errorMessage` field) and displayed in the UI.

### Required Fields Summary

| Field | Required | Constraints |
|---|---|---|
| Product | Yes | PARCEL, EXPRESS, or FREIGHT |
| Consignee.Name1 | Yes | Max 40 chars |
| Consignee.Street | Yes | |
| Consignee.ZIPCode | Yes | Valid postal code |
| Consignee.City | Yes | |
| Consignee.CountryCode | Yes | ISO 3166-1 alpha-2 |
| Shipper.ContactID | Yes | From GLS |
| ShipmentUnit[].Weight | Yes | > 0, in kg |

---

## MRW (Future Integration)

### Design Notes

MRW adapter would implement the same `CarrierAdapter` interface:

```typescript
interface CarrierAdapter {
  carrierName: string;
  createShipment(payload, credentials): Promise<CreateShipmentResult>;
  cancelShipment(trackingNumber, credentials): Promise<CancelShipmentResult>;
  getLabel(trackingNumber, credentials): Promise<{ pdfBase64: string } | null>;
  getServiceTypes(): ServiceType[];
}
```

### Expected MRW Service Types

- MRW Urgente 19h (next-day before 19:00)
- MRW Urgente 14h (next-day before 14:00)
- MRW Economy
- MRW Internacional

Exact product codes must be confirmed from MRW's integration documentation.

### Implementation Steps

1. Create `src/carriers/mrw.ts`
2. Add MRW credentials to Settings model (migration required)
3. Register adapter in `src/carriers/index.ts`
4. Add MRW credential fields to Settings UI

---

## Sources

- [Holded API Reference](https://developers.holded.com/reference)
- [Holded Documents API](https://developers.holded.com/reference/list-documents-1)
- [Holded Contacts API](https://developers.holded.com/reference/contacts)
- [GLS ShipIT REST API](https://shipit.gls-group.eu/webservices/3_2_9/doxygen/WS-REST-API/rest_shipment_processing.html)
- [GLS Developer Portal](https://dev-portal.gls-group.net/)
- [GLS ShipIT Request Samples](https://shipit.gls-group.eu/webservices/3_2_9/doxygen/WS-REST-API/rest_web_service_requests_samples.html)
