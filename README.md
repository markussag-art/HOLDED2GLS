# Holded2GLS

Shipment tracking synchronization platform between GLS/MRW carriers and Holded ERP.

## Features

- **Create shipments** linked to Holded waybill/sales order documents
- **Generate GLS labels** with automatic tracking number sync to Holded
- **Delete tracking** — clears tracking locally and in Holded
- **Regenerate labels** — replaces tracking atomically with Holded sync
- **Retry failed syncs** — retry Holded API calls without re-creating carrier shipments
- **Sync status badges** — visual indicators for Holded sync state (Synced / Error / Pending)
- **Idempotency** — prevents duplicate Holded writes when payload hasn't changed
- **Concurrency protection** — shipment-level locking prevents race conditions
- **Exponential backoff** — automatic retries for transient Holded API failures

## Setup

```bash
npm install
cp .env.example .env   # Configure your API keys
npx prisma migrate dev  # Run database migrations
npm run dev             # Start development server
```

## Environment Variables

| Variable         | Description                                      |
| ---------------- | ------------------------------------------------ |
| `DATABASE_URL`   | SQLite database path (default: `file:./dev.db`)  |
| `HOLDED_API_KEY` | Holded API key for tracking updates              |
| `GLS_API_URL`    | GLS/ASM endpoint (default: production)           |
| `GLS_USER`       | GLS API username (empty = simulated mode)        |
| `GLS_PASSWORD`   | GLS API password                                 |
| `GLS_UID_CLIENT` | GLS client UID                                   |

## API Endpoints

| Method | Path                                       | Description                  |
| ------ | ------------------------------------------ | ---------------------------- |
| GET    | `/api/shipments`                           | List all shipments           |
| POST   | `/api/shipments`                           | Create a new shipment        |
| GET    | `/api/shipments/:id`                       | Get shipment details         |
| POST   | `/api/shipments/:id/generate-label`        | Generate GLS label + sync    |
| POST   | `/api/shipments/:id/delete-tracking`       | Delete tracking + sync       |
| POST   | `/api/shipments/:id/regenerate-label`      | Regenerate label + sync      |
| POST   | `/api/shipments/:id/retry-sync`            | Retry failed Holded sync     |

## Architecture

See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for detailed API specifications and data flow diagrams.

## Tech Stack

- **Next.js 16** with App Router
- **TypeScript**
- **Prisma** ORM with SQLite
- **Tailwind CSS**
