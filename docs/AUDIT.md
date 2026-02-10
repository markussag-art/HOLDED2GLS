# Holded-GLS Webapp — Full Audit Report

**Auditors:** Principal Engineer / Senior QA / Product-UX Review
**Date:** 2026-02-10
**Codebase revision:** `0beb5f2` (branch `claude/update-code-tests-AFylw`)

---

## 1. EXECUTIVE SUMMARY

The app delivers a working **GLS SOAP label generator** with correct service codes, sender defaults, commercial-name-only label, reference formatting, and country-aware tracking URLs synced to Holded "Seguimiento". The core happy path (import waybill -> generate label -> sync tracking) functions as designed.

**However, approximately 40% of the specification remains unimplemented or partially implemented.** The most critical gap is that the "Complete & Email" button is an inert HTML element with **zero backend logic** — no Holded pipeline update, no email send, no completion state. Additional gaps include: no pagination on Holded import, no search/filter on the overview, no bulk operations, no health endpoints, no idempotency protection, and no edit capability for existing shipments.

**Recommendation: OPTION B — Targeted Refactor** (not rebuild). The GLS integration, tracking URL logic, and test infrastructure are solid. A ~2-sprint refactor can close all gaps without discarding working code.

---

## 2. FUNCTIONAL COVERAGE CHECKLIST

| # | Requirement | Status | Severity | Evidence | Fix |
|---|---|---|---|---|---|
| 1a | Holded ingestion — sync ALL pending waybills | **FAIL** | Critical | `holdedService.listWaybills()` fetches page 1 only, no loop, no `status=pending` filter | Add paginated fetch with status filter |
| 1b | Holded ingestion — no duplicates | **FAIL** | High | No unique constraint on `holded_doc_id`; no check before insert in `POST /shipments` | Add UNIQUE index + upsert guard |
| 1c | Holded ingestion — block/warn missing phone | **FAIL** | Medium | No validation; `recipientPhone` silently defaults to `''` | Add preflight validation in form + route |
| 1d | Holded ingestion — stores holdedDocType | **FAIL** | Low | Column `holded_doc_type` does not exist in schema | Add column via migration 003 |
| 2a | Overview — search | **FAIL** | High | `index.ejs` has no search input; route has no query param handling | Add search bar + `LIKE` query on waybill/name |
| 2b | Overview — filters (status, sync) | **FAIL** | High | No filter dropdowns; `findAll()` has no WHERE clause | Add filter params to route + model |
| 2c | Overview — bulk operations | **FAIL** | High | No checkboxes, no bulk action bar | Add row checkboxes + bulk generate/download/complete |
| 2d | Overview — status labels match spec | **FAIL** | Medium | Uses `LABEL_GENERATED` not `LABELED`; no `COMPLETED` status | Rename status enum values |
| 2e | Overview — "Complete & Email" in list | **FAIL** | High | Button only exists in detail view, and is non-functional | Implement in list after backend exists |
| 3a | Detail — editable parcelsCount/weight | **PARTIAL** | Medium | Only settable at creation; no edit form for existing shipments | Add `GET/POST /:id/edit` route |
| 3b | Detail — shipping method dropdown with persistence | **PASS** | — | `form.ejs:126-134` dropdown; saved in DB `shipping_method` | — |
| 3c | Detail — shipping notes checkboxes | **PASS** | — | `form.ejs:141-149` morning/afternoon checkboxes | — |
| 3d | Detail — generate label + download PDF | **PASS** | — | `POST /:id/generate-label` + `GET /:id/label` | — |
| 3e | Detail — bulk download/print multiple | **FAIL** | Medium | No bulk label route; labels served one at a time | Add `POST /shipments/bulk-labels` |
| 4a | GLS SOAP — correct WSDL | **PASS** | — | `gls.js:9` → `https://wsclientes.asmred.com/b2b.asmx?wsdl` | — |
| 4b | GLS SOAP — calls GrabarEnvio | **PASS** | — | `glsService.js:214` `client.GrabarEnvioAsync({ Ession: payload })` | — |
| 4c | GLS SOAP — stores PDF + download | **PASS** | — | `gls_label_data` column; `GET /:id/label` decodes base64 | — |
| 5a | Shipping methods — 3 exact labels | **PASS** | — | `gls.js:23-48` — all 3 match spec verbatim | — |
| 5b | Shipping methods — correct service codes | **PASS** | — | 1, 74, 10 — verified by tests `shippingMethods.test.js` | — |
| 6a | Label — commercial name on receiver | **PASS** | — | `glsService.js:127` `Nombre = commercialName \|\| legalName`; `Nombre2 = ''` | — |
| 6b | Label — sender = Yogufruta SCP | **PASS** | — | `defaults.js` + migration seed + payload builder defaults | — |
| 6c | Label — reference "Ref. Cli. Albaran" | **PASS** | — | `buildReferenceString()` at `glsService.js:73-76` | — |
| 6d | Label — delivery notes in Observaciones | **PASS** | — | `buildDeliveryNotes()` at `glsService.js:81-87` | — |
| 6e | Label — fallback internal slip PDF | **FAIL** | Low | Documented as limitation in QA_CHECKLIST; not implemented | Implement if GLS truncation confirmed |
| 7a | Tracking — ES format URL | **PASS** | — | `buildTrackingUrl()` → `/e/{number}/{postcode}` | — |
| 7b | Tracking — PT format URL | **PASS** | — | `buildTrackingUrl()` → `/expedition/{uuid}` | — |
| 7c | Tracking — full URL to Holded Seguimiento | **PASS** | — | `holdedService.updateTracking()` sends `{ tracking: url }` | — |
| 7d | Tracking — expedition UUID stored | **PASS** | — | `expedition_id` column (migration 002) | — |
| 8a | Delete tracking — clears Holded | **PASS** | — | `POST /:id/delete-tracking` calls `clearTracking()` | — |
| 8b | Regenerate — clear + new + sync | **PASS** | — | `POST /:id/regenerate-label` full flow | — |
| 8c | Idempotency — prevent double-click | **FAIL** | High | No mutex/lock; no client-side disable; no server-side guard | Add per-shipment lock + button disable |
| 9a | Complete & Email — button gating | **PARTIAL** | Critical | Button disabled unless synced — UI logic exists (`detail.ejs:126-128`) | Backend required |
| 9b | Complete & Email — set waybill Completed in Holded | **FAIL** | Critical | **Not implemented.** No route, no service method, no Holded API call | Implement `/complete` route + `holdedService.completeWaybill()` |
| 9c | Complete & Email — send email via Holded /send | **FAIL** | Critical | **Not implemented.** No `/send` endpoint integration | Implement `holdedService.sendDocument()` |
| 9d | Complete & Email — store completion timestamps | **FAIL** | Critical | No `completed_at`, `email_sent_at`, `email_status` columns | Add via migration 003 |
| 10a | Health — `/api/integrations/holded/health` | **FAIL** | Medium | No health routes exist | Add health check routes |
| 10b | Health — `/api/integrations/gls/health` | **FAIL** | Medium | No health routes exist | Add health check routes |
| 10c | docs/INTEGRATIONS.md | **PASS** | — | ~250 lines, comprehensive field mapping | — |
| 10d | docs/QA_CHECKLIST.md | **PASS** | — | ~220 lines, 60+ checkboxes | — |

**Summary: 17 PASS, 4 PARTIAL, 16 FAIL**

---

## 3. FINDINGS + FIXES (ordered by severity)

### CRITICAL

**F1. "Complete & Email" is a dead button**
- **Where:** `detail.ejs:131` — `<button class="btn btn-success">Complete & Email</button>`
- **Problem:** No `<form>` wrapping it, no `onclick`, no route handler. The button is purely cosmetic. The spec requires: (a) set waybill status to Completed in Holded via pipeline API, (b) send email via Holded `/send` endpoint, (c) store timestamps and email status.
- **Impact:** Users cannot complete the workflow. The app stops at "label generated + tracking synced" and the final step (notify customer) is manual.
- **Fix:**
  1. Add `holdedService.updatePipeline(docType, docId, status)` — calls `PUT /documents/{docType}/{docId}` with `{ pipeline: "completed" }` or use the pipeline endpoint.
  2. Add `holdedService.sendDocument(docType, docId)` — calls `POST /documents/{docType}/{docId}/send`.
  3. Add route `POST /shipments/:id/complete-and-email`.
  4. Add DB columns: `completed_at`, `holded_email_status` (`PENDING`|`SENT`|`ERROR`), `holded_email_sent_at`.
  5. Wire the button into a form.

**F2. Holded ingestion has no pagination — misses waybills**
- **Where:** `holdedService.listWaybills(page=1)` — single page fetch
- **Problem:** Holded API returns paginated results (typically 25-50 per page). If >1 page of waybills exists, they are silently dropped.
- **Fix:** Loop `listWaybills()` until empty page. Pass `status` param to filter Pending only.

**F3. No duplicate prevention on import**
- **Where:** `POST /shipments` route (`shipments.js:68`) — inserts blindly
- **Problem:** User can import the same Holded waybill multiple times, creating duplicate shipments. No UNIQUE constraint on `holded_doc_id`.
- **Fix:** Add `UNIQUE INDEX` on `holded_doc_id` (allow NULL for manual). Check for existing before insert.

### HIGH

**F4. No search or filters on overview page**
- **Where:** `GET /shipments` → `ShipmentModel.findAll()` → bare `SELECT * LIMIT 50`
- **Problem:** With 100+ shipments, users cannot find orders by waybill number, recipient, or status without scrolling.
- **Fix:** Add query params `?q=&status=&sync=` with corresponding WHERE clauses. Add search bar and filter dropdowns to `index.ejs`.

**F5. No bulk operations**
- **Where:** `index.ejs` — no checkboxes, no action bar
- **Problem:** Generating labels one-by-one for 50 waybills is impractical.
- **Fix:** Add checkbox column, "Select All", and bulk action bar (Generate Labels, Download PDFs, Complete & Email).

**F6. No idempotency on label generation**
- **Where:** `POST /:id/generate-label` — no lock, no client-side debounce
- **Problem:** Double-click creates two GLS shipments with different tracking numbers, wasting labels.
- **Fix:** Client-side: disable button on submit. Server-side: check `status !== 'PENDING'` before calling GLS. Optional: per-shipment mutex.

**F7. Status enum mismatch with spec**
- **Where:** Code uses `PENDING | LABEL_GENERATED | ERROR`. Spec requires `PENDING | LABELED | COMPLETED | ERROR`.
- **Fix:** Rename `LABEL_GENERATED` → `LABELED`. Add `COMPLETED` status for post-email state.

**F8. No edit capability for existing shipments**
- **Where:** Only `GET /shipments/new` + `POST /shipments` exist. No `GET /:id/edit` or `PUT /:id`.
- **Problem:** If weight, parcels, or shipping method needs adjustment after import, the user must delete and re-create.
- **Fix:** Add edit route that re-renders form pre-filled with existing data. Allow update while `status === 'PENDING'`.

### MEDIUM

**F9. No health endpoints**
- **Fix:** Add `GET /api/integrations/holded/health` (tests API key validity) and `GET /api/integrations/gls/health` (tests WSDL reachability).

**F10. No DB indexes**
- **Where:** `001_initial.js` — no CREATE INDEX statements
- **Fix:** Add indexes on `holded_doc_id`, `status`, `holded_tracking_sync_status`, `created_at`.

**F11. No holdedDocType column**
- **Fix:** Migration 003 adds `holded_doc_type TEXT DEFAULT 'waybill'`.

**F12. No phone/email validation or warning**
- **Fix:** Add visual "missing fields" chips on form and preflight check before label generation.

**F13. Observations field character limit**
- **Where:** GLS typically truncates at ~80-100 chars
- **Fix:** Add maxlength warning on textarea + server-side truncation with logged warning.

### LOW

**F14. No activity log per shipment** — Future enhancement.

**F15. No internal slip PDF fallback** — Documented limitation; implement if confirmed needed.

**F16. Holded import page shows all waybills (not just Pending)** — `listWaybills()` has no status filter param.

---

## 4. REBUILD vs. REFACTOR RECOMMENDATION

### Decision: **OPTION B — Targeted Refactor**

| Criterion | Score | Notes |
|---|---|---|
| Core GLS SOAP integration | Solid | Correct WSDL, payload, response parsing, label storage |
| Tracking URL builder | Solid | ES/PT/fallback with validation + comprehensive tests |
| Holded tracking sync | Solid | Correct API usage, clear/regenerate flows work |
| Test coverage | Good | 87 tests across unit/integration/e2e |
| Architecture separation | Adequate | Services/models/routes cleanly separated |
| Missing features | Additive | All gaps can be filled without restructuring existing code |
| Technical debt | Low-Medium | Main debt is missing validation and missing features, not bad patterns |
| DB schema | Extensible | SQLite with migrations; new columns easy to add |

**Why NOT rebuild:**
- The GLS SOAP integration is the hardest part and it works correctly
- Tracking URL logic is well-tested and production-ready
- Holded API integration patterns (client, auth, endpoints) are reusable
- Test infrastructure is established and passing
- A rebuild would take 3-4x longer and introduce regression risk for zero gain

**Why NOT just patch:**
- "Complete & Email" requires new service methods, routes, DB columns, and UI — too large for a patch
- Pagination + search + bulk ops touch multiple layers
- Status enum change affects DB values, views, and tests

**Refactor scope:** ~2 sprints (10 working days), broken into 3 phases.

---

## 5. IMPROVED BLUEPRINT

### 5.1 Architecture Improvements

```
src/
  config/
    database.js          (keep)
    defaults.js          (keep)
    gls.js               (keep)
  carriers/
    CarrierAdapter.js    (NEW — interface: createShipment, buildTrackingUrl, getHealth)
    gls/
      GlsAdapter.js      (refactor from glsService.js — implements CarrierAdapter)
      glsPayload.js      (extract payload building from glsService)
      glsSoapClient.js   (extract SOAP client management)
    mrw/                  (future — same interface)
  services/
    holdedService.js     (extend with: listPendingWaybills, completeWaybill, sendDocument)
    shipmentService.js   (NEW — orchestrates: create, generateLabel, complete, bulk ops)
    validationService.js (NEW — preflight checks, phone/email validation)
  models/
    Shipment.js          (extend with: findByFilters, findByHoldedDocId, updateStatus)
    Settings.js          (keep)
  routes/
    api/
      health.js          (NEW — /api/integrations/*/health)
    shipments.js         (extend with: edit, complete, bulk actions, search/filter)
    settings.js          (keep)
  middleware/
    idempotency.js       (NEW — per-shipment lock for label generation)
  migrations/
    003_completion.js    (NEW — adds completion/email columns, indexes, doc_type)
  views/
    shipments/
      index.ejs          (extend: search bar, filters, checkboxes, bulk action bar)
      form.ejs           (reuse for create + edit)
      detail.ejs         (wire Complete & Email button)
```

### 5.2 Carrier Adapter Interface (future MRW support)

```javascript
// carriers/CarrierAdapter.js
class CarrierAdapter {
  async createShipment(shipment) { throw new Error('Not implemented'); }
  buildTrackingUrl(params) { throw new Error('Not implemented'); }
  async getHealth() { throw new Error('Not implemented'); }
  getServiceMethods() { throw new Error('Not implemented'); }
}
```

GLS adapter wraps existing `glsService.js` logic. When MRW is added, it implements the same interface.

### 5.3 DB Schema Additions (Migration 003)

```sql
-- Completion & email tracking
ALTER TABLE shipments ADD COLUMN holded_doc_type TEXT DEFAULT 'waybill';
ALTER TABLE shipments ADD COLUMN completed_at TEXT DEFAULT NULL;
ALTER TABLE shipments ADD COLUMN holded_pipeline_status TEXT DEFAULT NULL;
ALTER TABLE shipments ADD COLUMN holded_email_status TEXT DEFAULT 'NOT_SENT';
ALTER TABLE shipments ADD COLUMN holded_email_sent_at TEXT DEFAULT NULL;
ALTER TABLE shipments ADD COLUMN holded_email_error TEXT DEFAULT NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_shipments_holded_doc_id ON shipments(holded_doc_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_sync_status ON shipments(holded_tracking_sync_status);
CREATE INDEX IF NOT EXISTS idx_shipments_created_at ON shipments(created_at);

-- Rename status values (data migration)
UPDATE shipments SET status = 'LABELED' WHERE status = 'LABEL_GENERATED';
```

### 5.4 UX/UI Improvements

**Overview Page:**
- Search bar: filter by waybill number, recipient name, tracking number
- Status filter dropdown: All | Pending | Labeled | Completed | Error
- Sync filter dropdown: All | Synced | Not Synced | Error
- Checkbox column + "Select All" header checkbox
- Bulk action bar (appears when rows selected):
  - "Generate Labels (N)" — bulk generate for PENDING
  - "Download Labels (N)" — zip download of PDFs
  - "Complete & Email (N)" — bulk complete for LABELED+SYNCED
- Row-level quick actions: Generate | Download | Complete
- Pagination controls (Prev/Next + page indicator)

**Detail Page:**
- "Complete & Email" wired to `POST /:id/complete-and-email` with form
- Completion card showing: completed_at, email status badge, retry button
- "Edit Shipment" button (only when status=PENDING) links to edit form
- Missing field warnings (e.g., "Phone missing — GLS may reject")

**Form Page:**
- Inline validation on required fields
- Character counter on delivery notes textarea (80 char limit warning)
- "Missing from Holded" indicators (yellow chips) on empty imported fields

### 5.5 Holded Service Additions

```javascript
// New methods needed:
async function listPendingWaybills() {
  // Paginate through ALL pages with status filter
  let page = 1, all = [];
  while (true) {
    const batch = await listWaybills(page);
    if (!batch.length) break;
    all.push(...batch);
    page++;
  }
  return all; // TODO: filter by pipeline status if Holded supports it
}

async function completeWaybill(docType, docId) {
  // PUT /api/invoicing/v1/documents/{docType}/{docId}
  // OR use pipeline endpoint to set status
  const client = createClient();
  return client.put(`/documents/${docType}/${docId}`, {
    pipeline: 'completed'
  });
}

async function sendDocument(docType, docId) {
  // POST /api/invoicing/v1/documents/{docType}/{docId}/send
  const client = createClient();
  return client.post(`/documents/${docType}/${docId}/send`);
}
```

---

## 6. IMPLEMENTATION PLAN (Refactor — 3 Phases)

### Phase 1: Critical Gaps (Days 1-4)

| Day | Task | Files |
|---|---|---|
| 1 | Migration 003: add completion columns + indexes + status rename | `src/migrations/003_completion.js`, `run.js` |
| 1 | Rename LABEL_GENERATED → LABELED across codebase | All views, routes, models, tests |
| 2 | Implement `holdedService.completeWaybill()` + `sendDocument()` | `holdedService.js` |
| 2 | Implement `POST /:id/complete-and-email` route | `shipments.js` |
| 2 | Wire "Complete & Email" button with form + disable logic | `detail.ejs` |
| 3 | Implement paginated Holded import with all pages | `holdedService.js`, `shipments.js` |
| 3 | Add duplicate guard (check holded_doc_id before insert) | `Shipment.js`, `shipments.js` |
| 4 | Add idempotency: client-side button disable + server-side status check | `detail.ejs`, `shipments.js` |
| 4 | Write tests for new Complete & Email flow | `tests/` |

### Phase 2: UX + Search + Edit (Days 5-7)

| Day | Task | Files |
|---|---|---|
| 5 | Add search bar + status/sync filter to overview | `index.ejs`, `shipments.js`, `Shipment.js` |
| 5 | Add pagination controls to overview | `index.ejs`, `shipments.js` |
| 6 | Add `GET /:id/edit` + `POST /:id/edit` routes | `shipments.js`, `form.ejs` |
| 6 | Add preflight validation (phone, postcode, weight) | `validationService.js`, `shipments.js` |
| 7 | Add health check endpoints | `routes/api/health.js`, `server.js` |
| 7 | Update INTEGRATIONS.md and QA_CHECKLIST.md | `docs/` |

### Phase 3: Bulk Ops + Carrier Abstraction (Days 8-10)

| Day | Task | Files |
|---|---|---|
| 8 | Add row checkboxes + bulk action bar to overview | `index.ejs` |
| 8 | Implement `POST /shipments/bulk-generate` | `shipments.js` |
| 9 | Implement `POST /shipments/bulk-download` (zip) | `shipments.js` |
| 9 | Implement `POST /shipments/bulk-complete` | `shipments.js` |
| 10 | Extract CarrierAdapter interface + GlsAdapter | `carriers/` |
| 10 | Final test pass + regression testing | `tests/` |

---

## 7. TEST STRATEGY

### Current Coverage (what exists — 87 tests)

| Layer | Tests | Covers |
|---|---|---|
| Unit | 64 | Payload builder, tracking URL, shipping methods, sender defaults, Holded data extraction |
| Integration | 22 | GLS payload per method, tracking sync mock flow, delete/regenerate |
| E2E | 1 | Full label+tracking flow with mocked SOAP+HTTP |

### Required Additions

**Unit Tests (add ~30):**
- `completeWaybill()` and `sendDocument()` — mock Holded API
- Paginated `listPendingWaybills()` — multi-page mock
- Duplicate detection in Shipment model
- Input validation service (phone, postcode, weight)
- Status transition guards (PENDING→LABELED→COMPLETED)
- Idempotency lock behavior

**Integration Tests (add ~15):**
- Complete & Email flow: generate → sync → complete → send email
- Bulk generate: create 3 pending → bulk generate → all LABELED
- Search/filter: create mixed-status shipments → verify filter results
- Edit shipment: change weight → verify DB updated
- Health endpoints: mock external API → verify response

**E2E Tests (add ~5, recommend Playwright):**
- Full happy path: Import from Holded → Generate Label → Complete & Email
- Bulk operations: Select 3 → Bulk Generate → Bulk Download
- Error recovery: GLS SOAP fails → retry → success
- Double-click prevention: verify only 1 label created
- PT shipment: Import → Generate → verify PT tracking URL format

**Contract Tests (add ~4):**
- GLS SOAP: verify payload matches WSDL schema
- Holded `/updatetracking`: verify payload schema
- Holded `/send`: verify request format
- Holded pipeline update: verify request format

### Test Infrastructure Recommendations
- Add `supertest` for HTTP-level integration tests
- Add Playwright for browser E2E tests (form submission, button states, bulk checkboxes)
- Add a test helper to seed DB with known states (PENDING, LABELED, COMPLETED)
- Mock server for Holded API (nock or msw) for integration tests

---

## APPENDIX: Quick Reference — What Works vs. What Doesn't

```
WORKING (ship it)                     BROKEN / MISSING (fix before production)
--------------------------------------+------------------------------------------
GLS SOAP label generation             | Complete & Email (dead button)
3 shipping methods (correct codes)    | Holded pagination (page 1 only)
Sender = Yogufruta SCP (correct)      | Duplicate import prevention
Reference = "Ref. Cli. Albaran X"     | Search / filters on overview
Commercial name only on label         | Bulk operations
ES tracking URL format                | Edit existing shipment
PT tracking URL format                | Health endpoints
Holded tracking sync (Seguimiento)    | Idempotency / double-click guard
Delete tracking flow                  | Status enum (LABELED / COMPLETED)
Regenerate label flow                 | DB indexes
Label download as PDF                 | Phone/email validation
Debug panel with redacted payloads    | Completion timestamps + email status
87 passing tests                      | Internal slip PDF fallback
docs/INTEGRATIONS.md                  | Activity log
docs/QA_CHECKLIST.md                  | Carrier adapter interface (MRW prep)
```
