# Holded → GLS Integration Documentation

## Overview

This application syncs delivery notes (albaranes) from **Holded** ERP and generates
shipping labels via the **GLS Spain (ASM)** SOAP API (`b2b.asmx`).

After label generation, a **tracking URL** is built based on the destination country
and synced to Holded as "Seguimiento" so customers receive the link via email.

---

## GLS Spain SOAP API

### Endpoint

- WSDL: `https://wsclientes.asmred.com/b2b.asmx?wsdl`
- Method used: `GrabarEnvio` (create shipment / record dispatch)

### Authentication

- `uidcliente`: API user ID provided by GLS/ASM
- Configured via `GLS_UID` env variable

---

## Shipping Methods & Service Codes

| UI Label (Dropdown) | Internal Key | GLS Service Code | GLS Product Code | Schedule | Notes |
|---|---|---|---|---|---|
| **ENTREGA ESTANDAR NACIONAL - COURIER EXPRESS 19:00** | `NATIONAL_STANDARD` | `1` | `1` | `19:00` | Standard national delivery |
| **ENTREGA ESTANDAR BALEARES - ECONOMY PARCEL2** | `BALEARIC_ECONOMY` | `74` | `74` | _(none)_ | Economy service for Balearic Islands |
| **ENTREGA ESTANDAR INTERNACIONAL** | `INTERNATIONAL` | `10` | `10` | _(none)_ | International delivery (EuroBusinessParcel) |

### Service Code Assumptions

- Service code `1` (Courier): Standard GLS Spain national courier service. Delivery by 19:00.
- Service code `74` (Economy Parcel): Economy tier used for island destinations (Balearic Islands).
- Service code `10` (EuroBusinessParcel): Standard GLS European international service.

> **Note:** These codes are based on the GLS Spain / ASM SOAP API documentation. If your GLS
> contract uses different product codes, update `src/config/gls.js` accordingly.

---

## GLS Tracking URL Rules

Tracking URLs are **country-dependent** and built by `buildTrackingUrl()` in `src/services/glsService.js`.

### Spain (ES)

**Format:** `https://mygls.gls-spain.es/e/<TRACKING_NUMBER>/<POSTCODE>`

| Component | Source | Required |
|---|---|---|
| `TRACKING_NUMBER` | GLS SOAP response → `Expedicion` / `NumeroEnvio` | Yes |
| `POSTCODE` | `shipments.recipient_postal_code` (digits only) | Yes |

**Example:** `https://mygls.gls-spain.es/e/1253243472/10100`

### Portugal (PT)

**Format:** `https://mygls.gls-spain.es/expedition/<EXPEDITION_UUID>`

| Component | Source | Required |
|---|---|---|
| `EXPEDITION_UUID` | GLS SOAP response → `ExpedicionUUID` / `UID` | Yes |

**Example:** `https://mygls.gls-spain.es/expedition/72f06264-1afb-4275-bb74-384c52ccc846`

### Other Countries

- If destination postcode is available → uses ES format as fallback
- If no postcode → throws error and blocks Holded sync
- A warning is logged: `[GLS Tracking] Country "XX" using ES-format URL as fallback.`

### Validation Rules

| Condition | Result |
|---|---|
| Country = ES, no postcode | **Error:** "Missing destination postcode for GLS Spain tracking." |
| Country = PT, no expeditionId | **Error:** "Missing GLS expedition ID for Portugal tracking." |
| Other country, no postcode | **Error:** Cannot build tracking URL |
| Missing tracking number (non-PT) | **Error:** "Missing GLS tracking number for tracking URL." |

---

## GLS SOAP Request Field Mapping

Below is the mapping from application data → GLS SOAP request fields → what appears on the printed label.

### Sender / Emitter Fields

| Label Element | GLS SOAP Field | Source | Default Value |
|---|---|---|---|
| Sender company name | `Remite_Nombre` | Settings → `sender_name` | **Yogufruta SCP** |
| Sender address | `Remite_Direccion` | Settings → `sender_address` | **C/ LA SELVA, 26 1º-2** |
| Sender city | `Remite_Poblacion` | Settings → `sender_city` | **Blanes** |
| Sender postal code | `Remite_CP` | Settings → `sender_postal_code` | **17300** |
| Sender country | `Remite_Pais` | Settings → `sender_country` | **ES** |
| Sender CIF/NIF | `Remite_NIF` | Settings → `sender_cif` | **J65549842** |
| Sender phone | `Remite_Telefono` | Settings → `sender_phone` | _(empty)_ |
| Sender email | `Remite_Email` | Settings → `sender_email` | _(empty)_ |

### Recipient Fields

| Label Element | GLS SOAP Field | Source | Notes |
|---|---|---|---|
| Recipient main name | `Nombre` | Holded contact `tradeName` (Commercial Name) | Primary name line on label |
| Recipient secondary name | `Nombre2` | Holded contact `name` (Legal Name) | Shown if different from Commercial Name |
| Recipient address | `Direccion` | Holded waybill `shippingAddress.address` | |
| Recipient city | `Poblacion` | Holded waybill `shippingAddress.city` | |
| Recipient postal code | `CP` | Holded waybill `shippingAddress.postalCode` | |
| Recipient country | `Pais` | Holded waybill `shippingAddress.country` | Default: `ES` |
| Recipient phone | `Telefono` | Holded contact `phone` or `mobile` | |
| Recipient email | `Email` | Holded contact `email` | |

### Reference / Waybill Number

| Label Element | GLS SOAP Field | Source | Format |
|---|---|---|---|
| Customer reference line | `Referencia` | Holded waybill `docNumber` | `Ref. Cli. Albaran <NUMBER>` |

The reference field prints on the GLS label as "Ref. Cli." and identifies the Holded
delivery note (albarán) associated with the shipment.

**Example:** Holded waybill `A250029` → `Referencia = "Ref. Cli. Albaran A250029"`

### Delivery Notes / Observations

| Label Element | GLS SOAP Field | Source | Notes |
|---|---|---|---|
| Observations line | `Observaciones` | Delivery window checkboxes + free text | Printed on label as notes |

Supported delivery window options:

- **"Entregar por la mañana"** → checkbox `deliveryMorning`
- **"Entregar por la tarde"** → checkbox `deliveryAfternoon`

Both can be selected. Additional free-text notes are appended after the checkbox values,
separated by ` | `.

**GLS Limitation:** The `Observaciones` field has a character limit (typically ~80-100 chars).
If notes exceed this, they may be truncated on the physical label. The application does not
currently enforce a character limit; consider adding validation if truncation is observed.

> **Fallback:** If GLS does not print observations on the carrier label for certain service
> types, the observations are still stored in the DB and visible in the shipment detail view.
> A future enhancement could generate an additional internal packing slip PDF with full notes.

### Other Fields

| GLS SOAP Field | Value | Notes |
|---|---|---|
| `Portes` | `P` | Prepaid (sender pays) |
| `Bultos` | Package count | Default: `1` |
| `Peso` | Weight in kg | Default: `1.0` |
| `FechaEnvio` | Current date | Format: `YYYY/MM/DD` |
| `Servicio` | Service code | See table above |
| `Horario` | Schedule | `19:00` for national, empty otherwise |

---

## GLS SOAP Response Handling

After calling `GrabarEnvio`, the response is parsed for:

| Response Field | Stored As | Used For |
|---|---|---|
| `Expedicion` / `NumeroEnvio` / `CodigoBarras` | `gls_tracking_number` | Tracking URL (ES) |
| `ExpedicionUUID` / `UID` | `expedition_id` | Tracking URL (PT) |
| `Etiqueta` / `Label` | `gls_label_data` | Label PDF (base64) |

---

## Holded API

### Endpoints Used

| Purpose | Method | Endpoint |
|---|---|---|
| List waybills | GET | `/api/invoicing/v1/documents/waybill` |
| Get single waybill | GET | `/api/invoicing/v1/documents/waybill/:id` |
| Get contact details | GET | `/api/invoicing/v1/contacts/:id` |
| **Update tracking** | **POST** | **`/api/invoicing/v1/documents/{docType}/{documentId}/updatetracking`** |

### Key Holded Fields

- `waybill.docNumber` → Waybill number (e.g., "A250029"), used as label reference
- `contact.name` → Legal / fiscal name of the recipient
- `contact.tradeName` → Commercial name (nombre comercial) of the recipient
- `waybill.shippingAddress` → Object with `address`, `city`, `postalCode`, `province`, `country`

### Holded Tracking Sync ("Seguimiento")

After label generation, the app calls `updateTracking()` to push the tracking URL to Holded:

**Request:**
```
POST /api/invoicing/v1/documents/waybill/{docId}/updatetracking
```

**Payload:**
```json
{
  "tracking": "https://mygls.gls-spain.es/e/1253243472/10100",
  "trackingNumber": "1253243472"
}
```

- `tracking` → Maps to "Seguimiento" in the Holded UI and customer emails
- `trackingNumber` → Stored as auxiliary tracking reference

The `tracking` field contains the **full clickable URL** so customers see the tracking link
directly in their notification email from Holded.

### Delete / Regenerate

| Action | Steps |
|---|---|
| **Delete tracking** | 1. Call `updateTracking` with empty strings → clears Holded "Seguimiento" <br> 2. Clear local DB fields: `gls_tracking_number`, `expedition_id`, `tracking_url`, label data <br> 3. Reset status to `PENDING` |
| **Regenerate label** | 1. Delete tracking (above) <br> 2. Call GLS `GrabarEnvio` again <br> 3. Extract new tracking/expedition data <br> 4. Build new tracking URL <br> 5. Push new URL to Holded |

---

## Database Schema

### `shipments` table

Stores all shipment data including both Holded source fields and GLS results:

- `recipient_name` — Legal name from Holded contact
- `recipient_commercial_name` — Commercial name from Holded contact (`tradeName`)
- `holded_waybill_number` — Waybill doc number from Holded
- `shipping_method` — Enum key (`NATIONAL_STANDARD`, `BALEARIC_ECONOMY`, `INTERNATIONAL`)
- `gls_service_code` — The GLS service code used
- `delivery_morning` — Boolean: "Entregar por la mañana"
- `delivery_afternoon` — Boolean: "Entregar por la tarde"
- `delivery_notes` — Free-text additional notes
- `gls_tracking_number` — GLS parcel tracking number
- `expedition_id` — GLS expedition UUID (used for PT tracking URLs) *(added in migration 002)*
- `tracking_url` — Full computed tracking URL *(added in migration 002)*
- `holded_tracking_sync_status` — `NOT_SYNCED` | `SYNCED` | `SYNC_ERROR` | `BLOCKED` *(added in migration 002)*
- `holded_tracking_payload` — JSON snapshot of last payload sent to Holded *(added in migration 002)*
- `gls_request_payload` — JSON of the last SOAP request (secrets redacted)
- `gls_response_payload` — JSON of the GLS SOAP response

### `settings` table

Key-value store for sender defaults. Seeded with Yogufruta SCP values on first migration.
