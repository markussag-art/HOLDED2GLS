# QA Checklist — Holded → GLS Label Generation

## Pre-requisites

- [ ] `.env` file configured with valid `GLS_UID`, `GLS_CLIENT_CODE`, `GLS_CONTRACT`
- [ ] `.env` file configured with valid `HOLDED_API_KEY`
- [ ] Database migrated (`npm run migrate` or auto-migrated on startup)
- [ ] App running (`npm start`)

---

## A) Shipping Methods Dropdown

- [ ] Navigate to **New Shipment** (`/shipments/new`)
- [ ] Verify the "Select Service" dropdown contains exactly 3 options:
  1. [ ] `ENTREGA ESTANDAR NACIONAL - COURIER EXPRESS 19:00`
  2. [ ] `ENTREGA ESTANDAR BALEARES - ECONOMY PARCEL2`
  3. [ ] `ENTREGA ESTANDAR INTERNACIONAL`
- [ ] Select each method and create a test shipment — confirm it saves correctly
- [ ] In shipment detail, confirm the selected method and GLS service code are displayed

---

## B) Label Content — Receiver Names

- [ ] Import a waybill from Holded (`/shipments/import`) for a contact that has BOTH `name` (legal) and `tradeName` (commercial name)
- [ ] In the shipment form, verify:
  - [ ] "Commercial Name" field is pre-filled with `tradeName`
  - [ ] "Legal Name" field is pre-filled with `name`
- [ ] Generate label and check GLS debug payload:
  - [ ] `Nombre` = Commercial Name (primary)
  - [ ] `Nombre2` = Legal Name (secondary, if different)
- [ ] On the printed GLS label, verify the commercial name appears prominently

---

## C) Label Content — Sender / Emitter

- [ ] Verify Settings page (`/settings`) shows:
  - Name: **Yogufruta SCP**
  - Address: **C/ LA SELVA, 26 1º-2**
  - City: **Blanes**
  - Postal Code: **17300**
  - CIF: **J65549842**
- [ ] Create a shipment and check debug payload:
  - [ ] `Remite_Nombre` = `Yogufruta SCP`
  - [ ] `Remite_Direccion` = `C/ LA SELVA, 26 1º-2`
  - [ ] `Remite_Poblacion` = `Blanes`
  - [ ] `Remite_CP` = `17300`
  - [ ] `Remite_NIF` = `J65549842`
- [ ] On the printed label, verify sender shows as Yogufruta SCP (NOT "yogurshop")

---

## D) Label Content — Waybill Reference

- [ ] Import waybill with docNumber (e.g., `A250029`) from Holded
- [ ] Create shipment — verify `holded_waybill_number` is saved in DB
- [ ] In shipment detail, verify reference shows: `Ref. Cli. Albaran A250029`
- [ ] Check debug payload: `Referencia` = `Ref. Cli. Albaran A250029`
- [ ] On the printed label, verify the reference line is visible

---

## E) Label Content — Delivery Notes

- [ ] Create a new shipment with "Entregar por la mañana" checked
  - [ ] Debug payload `Observaciones` contains `Entregar por la mañana`
  - [ ] On label: morning note visible in observations
- [ ] Create a new shipment with "Entregar por la tarde" checked
  - [ ] Debug payload `Observaciones` contains `Entregar por la tarde`
  - [ ] On label: afternoon note visible in observations
- [ ] Create a new shipment with BOTH checked
  - [ ] Both notes appear in `Observaciones`
- [ ] Create a shipment with additional free-text notes
  - [ ] All notes combined in `Observaciones`

---

## F) Tracking URL — Spain (ES)

- [ ] Create a shipment with `recipientCountry = ES` and a valid postal code (e.g., `28001`)
- [ ] Generate label
- [ ] In shipment detail, verify:
  - [ ] Tracking URL format: `https://mygls.gls-spain.es/e/<TRACKING_NUMBER>/<POSTCODE>`
  - [ ] Tracking URL is clickable and opens GLS tracking page
  - [ ] Tracking number is displayed
- [ ] Verify Holded sync status is `SYNCED`
- [ ] Open Holded waybill — confirm "Seguimiento" shows the tracking URL
- [ ] Confirm customer email from Holded contains the tracking link

---

## G) Tracking URL — Portugal (PT)

- [ ] Create a shipment with `recipientCountry = PT`
- [ ] Generate label
- [ ] In shipment detail, verify:
  - [ ] Expedition ID is populated (from GLS response)
  - [ ] Tracking URL format: `https://mygls.gls-spain.es/expedition/<EXPEDITION_UUID>`
  - [ ] Tracking URL is clickable
- [ ] Verify Holded sync status is `SYNCED`
- [ ] Open Holded waybill — confirm "Seguimiento" shows the PT tracking URL

---

## H) Tracking URL — Validation Errors

- [ ] Create an ES shipment with **empty postal code**
  - [ ] Label generation should proceed but tracking URL should fail
  - [ ] Error message: "Missing destination postcode for GLS Spain tracking."
  - [ ] Holded sync status should be `BLOCKED`
  - [ ] "Complete & Email" button should be **disabled**
- [ ] Create a PT shipment where GLS does not return an expedition UUID
  - [ ] Error message: "Missing GLS expedition ID for Portugal tracking."
  - [ ] Holded sync should be blocked

---

## I) Delete Tracking

- [ ] On a shipment with a generated label and synced tracking:
  - [ ] Click "Delete Tracking"
  - [ ] Confirm dialog appears
  - [ ] After confirmation:
    - [ ] Tracking number cleared
    - [ ] Tracking URL cleared
    - [ ] Expedition ID cleared
    - [ ] Label data cleared
    - [ ] Status reset to `PENDING`
    - [ ] Holded sync status reset to `NOT_SYNCED`
  - [ ] Open Holded waybill — confirm "Seguimiento" is now empty

---

## J) Regenerate Label

- [ ] On a shipment with a generated label:
  - [ ] Click "Regenerate Label"
  - [ ] Confirm dialog appears
  - [ ] After confirmation:
    - [ ] Old tracking data cleared first
    - [ ] New GLS label generated
    - [ ] New tracking URL built
    - [ ] New tracking synced to Holded
    - [ ] Holded sync status is `SYNCED`
  - [ ] Verify new tracking URL is different from old one (if new tracking number differs)

---

## K) Complete & Email Button

- [ ] Button is **disabled** when:
  - [ ] No tracking number
  - [ ] No tracking URL
  - [ ] Holded sync status is not `SYNCED`
- [ ] Button is **enabled** only when all three conditions met:
  - [ ] Tracking number present
  - [ ] Tracking URL present
  - [ ] Holded sync status = `SYNCED`

---

## L) Full End-to-End Test

For **each** of the 3 shipping methods, perform:

1. [ ] Sync a pending waybill from Holded (contact with both Name and Commercial Name)
2. [ ] Select the shipping method
3. [ ] Check morning or afternoon delivery checkbox
4. [ ] Generate label via "Generate GLS Label" button
5. [ ] Confirm the GLS request payload in the debug panel shows:
   - [ ] Correct `Servicio` code for the method
   - [ ] Correct sender (Yogufruta SCP)
   - [ ] `Referencia` with waybill number
   - [ ] `Observaciones` with delivery notes
   - [ ] `Nombre` with commercial name
6. [ ] Confirm tracking URL is generated and displayed
7. [ ] Confirm Holded sync status is `SYNCED`
8. [ ] Confirm Holded tracking sync payload is visible in debug panel
9. [ ] Download/view the generated label PDF
10. [ ] On the printed label, confirm:
    - [ ] Receiver commercial name visible
    - [ ] Sender: Yogufruta SCP, C/ LA SELVA 26, Blanes, J65549842
    - [ ] Reference line with waybill number
    - [ ] Notes/observations printed (if GLS supports it for this service)

---

## M) Automated Tests

- [ ] Run `npm test` — all tests pass
- [ ] Unit tests verify:
  - [ ] 3 shipping methods with correct labels
  - [ ] Service codes: 1, 74, 10
  - [ ] Sender defaults are Yogufruta SCP
  - [ ] Reference format: "Ref. Cli. Albaran <NUMBER>"
  - [ ] Delivery notes build correctly
  - [ ] **ES tracking URL: `https://mygls.gls-spain.es/e/<num>/<cp>`**
  - [ ] **PT tracking URL: `https://mygls.gls-spain.es/expedition/<uuid>`**
  - [ ] **Missing data throws errors**
- [ ] Integration tests verify:
  - [ ] SOAP payload correct for each method
  - [ ] Morning/afternoon notes in Observaciones
  - [ ] **Holded updatetracking payload contains full tracking URL**
  - [ ] **Delete clears Seguimiento**
  - [ ] **Regenerate updates Seguimiento with new URL**

---

## Known Limitations

- GLS returns a carrier-generated label; we cannot fully customize its layout.
  The fields `Nombre`, `Nombre2`, `Remite_*`, `Referencia`, `Observaciones` are
  the controllable parts. Physical label appearance depends on GLS template.
- `Observaciones` may be truncated by GLS (~80-100 char limit).
- `Remite_NIF` (CIF) printing on label depends on the GLS label template version.
- For PT tracking, the `ExpedicionUUID` field must be present in the GLS SOAP response.
  If your GLS contract does not return this field, PT tracking URLs cannot be generated.
- Country is sourced from the Holded shipping address (`shippingAddress.country`), not user input.
