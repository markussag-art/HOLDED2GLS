# Integrations

## Holded API — Update Tracking Info

### Endpoint

```
POST https://api.holded.com/api/invoicing/v1/documents/{docType}/{documentId}/updatetracking
```

### Authentication

Header-based API key:

```
key: <HOLDED_API_KEY>
```

### Path Parameters

| Parameter    | Type   | Required | Description                                        |
| ------------ | ------ | -------- | -------------------------------------------------- |
| `docType`    | string | Yes      | Document type. Must be `salesorder` or `waybill`.   |
| `documentId` | string | Yes      | The Holded document ID (MongoDB ObjectId format).   |

### Request Body (JSON)

```json
{
  "key": "other",
  "name": "GLS Spain",
  "num": "GLS1234567890",
  "pickUpDate": "08/02/2026",
  "deliveryDate": "10/02/2026",
  "notes": "Optional note"
}
```

| Field          | Type   | Required | Description                                                                                 |
| -------------- | ------ | -------- | ------------------------------------------------------------------------------------------- |
| `key`          | string | No       | Carrier key. One of: `mrw`, `ups`, `fedex`, `tnt`, `seur`, `nacex`, `correos`, `asm`, `uspostalservice`, `dbschenker`, `royalmail`, `bluedart`, `palletways`, `correosexpress`, `tourline`, `other`. Use `other` for GLS. |
| `name`         | string | No       | Display name for the carrier (e.g. `"GLS Spain"`).                                          |
| `num`          | string | No       | Tracking number(s), comma-separated for multiple.                                           |
| `pickUpDate`   | string | No       | Pick-up date in `DD/MM/YYYY` format.                                                        |
| `deliveryDate` | string | No       | Delivery date in `DD/MM/YYYY` format.                                                       |
| `notes`        | string | No       | Free-text notes.                                                                            |

### Response

```json
{
  "status": 1,
  "info": "Updated"
}
```

### Clearing Tracking

To clear/remove tracking from a document, send a request with empty string values:

```json
{
  "key": "",
  "name": "",
  "num": ""
}
```

### Carrier Mapping

| Platform Carrier | Holded `key` | Holded `name` |
| ---------------- | ------------ | ------------- |
| GLS              | `other`      | `GLS Spain`   |
| MRW              | `mrw`        | `MRW`         |

### Error Handling

- **401**: Invalid or missing API key.
- **404**: Document not found (wrong `docType` or `documentId`).
- **500**: Holded internal error — retry with exponential backoff.

---

## Holded API — Set Pipeline Stage (Complete)

### Endpoint

```
PUT https://api.holded.com/api/invoicing/v1/documents/{docType}/{documentId}/pipeline/set
```

### Authentication

Header-based API key:

```
key: <HOLDED_API_KEY>
```

### Path Parameters

| Parameter    | Type   | Required | Description                                        |
| ------------ | ------ | -------- | -------------------------------------------------- |
| `docType`    | string | Yes      | Document type. Must be `salesorder` or `waybill`.   |
| `documentId` | string | Yes      | The Holded document ID (MongoDB ObjectId format).   |

### Request Body (JSON)

```json
{
  "pipeline": "<PIPELINE_STAGE_ID>"
}
```

| Field      | Type   | Required | Description                                                                 |
| ---------- | ------ | -------- | --------------------------------------------------------------------------- |
| `pipeline` | string | Yes      | Pipeline stage ID. Custom per Holded account — set via `HOLDED_COMPLETED_PIPELINE_ID` env var. |

### Response

```json
{
  "status": 1,
  "info": "Updated"
}
```

### Notes

- Pipeline stages are **custom per Holded account**. You must look up the correct stage ID in your Holded settings and set it as `HOLDED_COMPLETED_PIPELINE_ID`.
- This endpoint is idempotent — calling it again with the same pipeline ID has no side effects.

---

## Holded API — Send Document (Email)

### Endpoint

```
POST https://api.holded.com/api/invoicing/v1/documents/{docType}/{documentId}/send
```

### Authentication

Header-based API key:

```
key: <HOLDED_API_KEY>
```

### Path Parameters

| Parameter    | Type   | Required | Description                                        |
| ------------ | ------ | -------- | -------------------------------------------------- |
| `docType`    | string | Yes      | Document type. Must be `salesorder` or `waybill`.   |
| `documentId` | string | Yes      | The Holded document ID (MongoDB ObjectId format).   |

### Request Body (JSON)

```json
{
  "emails": "customer@example.com",
  "mailTemplateId": "<TEMPLATE_ID>"
}
```

| Field            | Type   | Required | Description                                                                                   |
| ---------------- | ------ | -------- | --------------------------------------------------------------------------------------------- |
| `emails`         | string | Yes      | Recipient email address(es), comma-separated for multiple.                                    |
| `mailTemplateId` | string | No       | Holded email template ID. If omitted, uses the default template.                              |
| `subject`        | string | No       | Custom email subject. Overrides template subject if provided.                                 |
| `message`        | string | No       | Custom email body. Overrides template message if provided.                                    |
| `docIds`         | string | No       | Comma-separated document IDs to attach. Defaults to the document in the URL.                  |

### Response

```json
{
  "status": 1,
  "info": "Sent"
}
```

### Notes

- The `emails` field is **required** — the API does not auto-use the contact's stored email.
- Optionally configure `HOLDED_WAYBILL_MAIL_TEMPLATE_ID` env var to use a custom email template.

---

## GLS Spain API (ASM Red)

### Base URL

```
https://wsclientes.asmred.com/services.asmx
```

### Authentication

SOAP-based with `uidcliente`, `usuario`, and `password` fields in the request body.

### Create Shipment (GrabarEnvio)

Creates a shipment and returns a tracking number + label.

**SOAPAction**: `http://www.asmred.com/GrabarEnvio`

**Response fields**:
- `codbarras`: Tracking number (barcode)
- `etiqueta`: Base64-encoded label PDF
- `resultado`: Error message if failed

### Cancel Shipment (AnularEnvio)

Cancels a previously created shipment.

**SOAPAction**: `http://www.asmred.com/AnularEnvio`

### Tracking URL

```
https://www.gls-spain.es/es/ayuda/seguimiento/?match={trackingNumber}
```

---

## Data Flow

### Label Generation
1. User creates shipment in platform (linked to Holded document)
2. User clicks "Generate Label"
3. Platform calls GLS API → gets tracking number + label
4. Platform saves tracking number locally
5. Platform calls Holded `updatetracking` API with tracking info
6. On success: `trackingSyncStatus = SYNCED`
7. On failure: `trackingSyncStatus = ERROR`, user can "Retry Sync"

### Delete Tracking
1. User clicks "Delete Tracking"
2. Platform clears `trackingNumber` and `trackingUrl` locally
3. Platform calls Holded `updatetracking` with empty payload
4. On success: `trackingSyncStatus = SYNCED`
5. On failure: `trackingSyncStatus = ERROR`, user can "Retry Sync"

### Regenerate Label
1. User clicks "Regenerate Label" (with confirmation)
2. If existing tracking: Platform clears tracking in Holded first
3. Platform calls GLS API → gets new tracking number + label
4. Platform saves new tracking number locally
5. Platform calls Holded `updatetracking` with new tracking info
6. Each step can fail independently — errors are reported and retryable

### Complete & Email
1. Pre-checks: tracking number exists, `trackingSyncStatus == SYNCED`, status != COMPLETED, recipient email present
2. Platform calls Holded `pipeline/set` to mark waybill as Completed (skipped if already done — idempotent)
3. Platform calls Holded `send` to email the waybill PDF to the customer
4. If both succeed: `status = COMPLETED`, `holdedEmailStatus = SENT`
5. If pipeline succeeds but email fails: `holdedEmailStatus = ERROR`, status stays LABELED — user sees "Retry Email"
6. If pipeline fails: error returned, nothing changes locally

### Resend Email
1. Available when `holdedEmailStatus == ERROR` or when COMPLETED + already SENT
2. Platform calls Holded `send` to re-send the waybill email
3. Updates `holdedEmailStatus` and `holdedEmailSentAt` on success
