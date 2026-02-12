# HOLDED2GLS Integration Documentation

## Overview

HOLDED2GLS integrates Holded (invoicing/waybill management) with GLS Spain (shipping/label generation).

Workflow:
1. Waybills are synced from Holded (status: **Accepted** by default — no Pending→Accepted transition)
2. GLS labels are generated via SOAP API
3. Tracking information is pushed back to Holded in multiple fields
4. The waybill pipeline stage is set to mark it as shipped

---

## Holded API Integration

### Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/invoicing/v1/documents/{docType}` | GET | List waybills |
| `/api/invoicing/v1/documents/{docType}/{id}` | GET | Get document details |
| `/api/invoicing/v1/documents/{docType}/{id}` | PUT | Update document (custom fields) |
| `/api/invoicing/v1/documents/{docType}/{id}/updatetracking` | POST | Update tracking info ("Seguimiento") |
| `/api/invoicing/v1/documents/{docType}/{id}/pipeline/set` | POST | Set pipeline stage ("Etapa") |

### Authentication

All requests include the header `key: <HOLDED_API_KEY>`.

---

## Custom Fields Schema

Holded documents contain custom fields in their JSON response. The structure varies by API version:

### Format observed

```json
{
  "customFields": [
    {
      "field": "cf_abc123",
      "name": "Seguimiento de Envio",
      "value": "https://mygls.gls-spain.es/e/TRK123/28001"
    },
    {
      "field": "cf_xyz789",
      "name": "Other Field",
      "value": "some value"
    }
  ]
}
```

### How we locate "Seguimiento de Envio"

1. **Fetch the document** via `GET /api/invoicing/v1/documents/{docType}/{id}`
2. **Iterate `customFields` array**, matching on `name` (or `label`) === `"Seguimiento de Envio"`
3. **Update the value** with the full tracking URL
4. **Persist via PUT** `PUT /api/invoicing/v1/documents/{docType}/{id}` with the updated `customFields` array
5. All other custom fields are preserved unchanged

### Alternative format (if `customFieldsDef` is present)

Some documents return field definitions separately:

```json
{
  "customFieldsDef": [
    { "id": "cf_abc123", "name": "Seguimiento de Envio", "type": "text" }
  ],
  "customFields": [
    { "field": "cf_abc123", "value": "" }
  ]
}
```

In this case, we cross-reference `customFieldsDef` to find the field ID by name, then update the matching entry in `customFields`.

---

## Pipeline / Etapa

### Stage: "🛻 => Enviado por API GLS"

- **Stage ID**: `698cbc438d534d720403ffa3`
- **Applied when**: ALL three conditions are met:
  1. GLS label generated successfully (trackingNumber exists, PDF stored)
  2. Holded "Seguimiento" updated with full tracking URL
  3. Holded custom field "Seguimiento de Envio" updated with the same URL

### API Call

```
POST /api/invoicing/v1/documents/{docType}/{id}/pipeline/set
Body: { "stageId": "698cbc438d534d720403ffa3" }
```

The etapa is **NOT set** if either tracking or custom field sync fails. This prevents marking a waybill as "sent" when Holded is not fully up to date.

---

## Tracking URL Rules

| Destination | URL Format | Required Fields |
|-------------|-----------|-----------------|
| ES (Spain) | `https://mygls.gls-spain.es/e/<TRACKING_NUMBER>/<POSTCODE_DIGITS>` | trackingNumber, postcode |
| PT (Portugal) | `https://mygls.gls-spain.es/expedition/<EXPEDITION_UUID>` | expeditionId from GLS SOAP response |

- Tracking URL is **not pushed to Holded** unless it passes validation
- For PT shipments, `expeditionId` is extracted from the GLS SOAP response and stored locally

---

## Tracking is Written to Two Places in Holded

1. **Built-in "Seguimiento"** — via `/updatetracking` endpoint
2. **Custom field "Seguimiento de Envio"** — via `PUT` document update

Both must contain the full tracking URL (not just the tracking number).

---

## Label Generation Pipeline (Atomic Steps)

```
1. GLS SOAP createShipment → trackingNumber (+expeditionId if PT) → save PDF
2. Build trackingUrl (ES/PT rules) → store locally
3. POST /updatetracking to Holded with trackingUrl
4. PUT document update to set "Seguimiento de Envio" custom field
5. POST /pipeline/set with stage 698cbc438d534d720403ffa3  ← ONLY if 3+4 succeed
6. Update local DB status fields
```

### Error handling per step

Each Holded sync step has its own status field in the local DB:

| Field | Values |
|-------|--------|
| `holdedTrackingSyncStatus` | `NOT_SYNCED` / `SYNCED` / `ERROR` |
| `holdedCustomFieldSyncStatus` | `NOT_SYNCED` / `SYNCED` / `ERROR` |
| `holdedStageSyncStatus` | `NOT_SYNCED` / `SYNCED` / `ERROR` |

If a step fails:
- The label and tracking artifacts are preserved locally
- The error message is stored in the corresponding `*SyncError` field
- The user can retry individual steps or all at once

---

## Retry Strategy

### Individual retry endpoints

| Endpoint | Retries |
|----------|---------|
| `POST /api/shipments/:id/retry-tracking-sync` | Re-sends tracking URL to Holded Seguimiento |
| `POST /api/shipments/:id/retry-custom-field-sync` | Re-updates "Seguimiento de Envio" custom field |
| `POST /api/shipments/:id/retry-stage-sync` | Sets etapa (only if tracking + custom field are SYNCED) |
| `POST /api/shipments/:id/retry-all-sync` | Retries all failed steps in order |

### Idempotency

- **Label generation** is locked per document ID to prevent double-click duplicates
- **Retry operations** read the stored tracking URL and re-send it (no re-generation)
- **Etapa set** is idempotent — calling pipeline/set with the same stage ID is safe

---

## Delete Tracking Behavior

When tracking is deleted:

1. Holded "Seguimiento" is cleared (empty string via `/updatetracking`)
2. Custom field "Seguimiento de Envio" is cleared (empty string via PUT)
3. **Etapa is LEFT UNTOUCHED** — design decision: the pipeline stage serves as an audit trail. Clearing it could lose history of what was previously shipped. The cleared tracking fields signal that the shipment needs re-processing.
4. Local tracking fields are reset to null, status returns to PENDING

---

## Regenerate Label Flow

1. Clear Holded Seguimiento (best-effort)
2. Clear custom field "Seguimiento de Envio" (best-effort)
3. Reset local sync statuses
4. Create new GLS shipment → new trackingNumber
5. Run full label generation pipeline (steps 2–6)
6. Lock prevents concurrent regeneration for the same document

---

## No "Pending → Accepted" Transition

Waybills arrive in Holded with **Accepted** as the default status. The application:

- Does **NOT** look for a "Pending" starting state
- Does **NOT** attempt to change document status from Pending to Accepted
- Syncs waybills that are eligible for processing (not yet in the "Enviado por API GLS" etapa)
- Uses the pipeline etapa (not document status) to represent "sent by GLS API"

---

## GLS SOAP Integration

- **WSDL**: Configured via `GLS_WSDL_URL` environment variable
- **Create shipment**: `GrabarEnvio` SOAP method
- **Cancel shipment**: `AnularEnvio` SOAP method
- **Response parsing**: Tracking number from `Seguimiento` / `CodigoBarras` fields; expedition ID from `ExpeditionId` / `UidExpedicion`; label PDF from `Etiqueta` (base64)

---

## Database Schema

See `src/models/database.ts` for the full SQLite schema. Key fields:

| Column | Type | Purpose |
|--------|------|---------|
| `holdedStageIdLastSet` | TEXT | Last Holded stage ID that was set |
| `holdedStageSyncStatus` | TEXT | NOT_SYNCED / SYNCED / ERROR |
| `holdedCustomFieldSyncStatus` | TEXT | NOT_SYNCED / SYNCED / ERROR |
| `holdedCustomFieldSyncError` | TEXT | Error message if custom field sync failed |
| `expeditionId` | TEXT | GLS expedition UUID (required for PT tracking) |
| `trackingUrl` | TEXT | Full tracking URL (ES or PT format) |
