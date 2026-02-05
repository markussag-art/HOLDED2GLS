# Holded2GLS - Shipping Label Platform

Internal web platform that syncs "Pending" shipping documents from Holded ERP, lets warehouse/admin users configure parcels and weight, then generates and prints GLS shipping labels (PDF).

## Features

- **Holded Sync**: Pull pending waybills/delivery notes from Holded ERP
- **Order Management**: Table view with status filters, search, pagination
- **Shipment Editing**: Detail drawer to edit recipient, address, parcels, weight
- **GLS Label Generation**: Create shipments via GLS ShipIT API, get PDF labels
- **Print/Download**: Inline PDF download and browser print
- **Cancel & Regenerate**: Cancel a label and generate a new one for the same order
- **Carrier Adapter Pattern**: Designed for easy addition of MRW or other carriers
- **Encrypted Credentials**: API keys encrypted at rest using AES-256-GCM
- **Audit Logging**: All sync, label, cancel, and ship actions are logged

## Tech Stack

- **Next.js 15** (App Router) with TypeScript
- **Tailwind CSS v4** for styling
- **Prisma** ORM with SQLite (swap to PostgreSQL for production)
- **NextAuth.js v4** for authentication
- **Docker** ready with docker-compose

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+

### Local Development

```bash
# 1. Clone and install
git clone <repo-url>
cd HOLDED2GLS
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your values (see Environment Variables below)

# 3. Run database migration
npx prisma migrate dev

# 4. Start dev server
npm run dev
```

Open http://localhost:3000. On first login, enter any email + the ADMIN_PASSWORD to auto-create the admin account.

### Docker

```bash
# Build and run
docker compose up --build

# Or set env vars first
export NEXTAUTH_SECRET=$(openssl rand -base64 32)
export ENCRYPTION_KEY=$(openssl rand -hex 32)
docker compose up --build
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | SQLite connection string | `file:./dev.db` |
| `NEXTAUTH_SECRET` | JWT signing secret | (must set) |
| `NEXTAUTH_URL` | App URL | `http://localhost:3000` |
| `ENCRYPTION_KEY` | 64-char hex string for AES-256 | (must set) |
| `ADMIN_PASSWORD` | Initial admin password | `admin123` |

## Usage

### 1. Configure Settings

Go to **Settings** page and enter:
- **Holded API Key** (from Holded Settings > API)
- **GLS Credentials** (username, password, contact ID from GLS)
- **Sender/Shipper Details** (your company info)
- **Document Type** (waybill, salesorder, etc.)

### 2. Sync Orders

Click **Sync Pending** on the Orders page to pull documents from Holded.

### 3. Process Shipments

1. Click an order row to open the detail drawer
2. Verify/edit recipient address
3. Set number of parcels and total weight
4. Choose GLS service type
5. Click **Generate GLS Label**
6. Download or Print the PDF label

### 4. Cancel & Regenerate

If needed, click **Cancel** on a labeled shipment, then **Generate GLS Label** again.

## Project Structure

```
src/
  app/
    api/
      auth/[...nextauth]/  - NextAuth endpoint
      carriers/             - List available carriers & services
      settings/             - GET/PUT settings
      shipments/            - List shipments (GET)
      shipments/[id]/       - Get/update single shipment
      shipments/[id]/label/ - Generate (POST) / Download (GET) label
      shipments/[id]/cancel/- Cancel shipment label
      shipments/[id]/ship/  - Mark as shipped
      sync/                 - Sync from Holded (POST)
    login/                  - Login page
    orders/                 - Orders list page
    settings/               - Settings page
  carriers/
    types.ts                - CarrierAdapter interface
    gls.ts                  - GLS ShipIT implementation
    index.ts                - Carrier registry
  components/
    AppShell.tsx            - Navigation layout
    Providers.tsx           - NextAuth session provider
    ShipmentDrawer.tsx      - Order detail drawer
    StatusBadge.tsx         - Status badge component
  lib/
    auth.ts                 - NextAuth configuration
    encryption.ts           - AES-256-GCM encrypt/decrypt
    holded.ts               - Holded API client
    prisma.ts               - Prisma client singleton
    settings.ts             - Settings helper (encrypt/decrypt)
prisma/
  schema.prisma             - Database schema
  migrations/               - SQL migrations
docs/
  INTEGRATIONS.md           - API integration details
storage/
  labels/                   - Generated PDF labels
```

## Adding a New Carrier (e.g., MRW)

1. Create `src/carriers/mrw.ts` implementing `CarrierAdapter` interface
2. Register it in `src/carriers/index.ts`
3. Add MRW credentials fields to the Settings model and UI
4. The carrier's service types will automatically appear in the drawer dropdown

## Security

- API keys encrypted at rest with AES-256-GCM
- Secrets never logged (redacted in audit logs)
- Session-based auth with JWT
- CSRF protection via NextAuth
