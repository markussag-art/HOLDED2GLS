# HOLDED2GLS

Holded → GLS shipping label generation webapp.

Syncs delivery notes (albaranes) from Holded ERP and generates shipping labels via the GLS Spain (ASM) SOAP API.

## Setup

```bash
cp .env.example .env   # Configure your API keys
npm install
npm start              # Runs on http://localhost:3000
```

## Shipping Methods

| Service | GLS Code |
|---|---|
| ENTREGA ESTANDAR NACIONAL - COURIER EXPRESS 19:00 | 1 |
| ENTREGA ESTANDAR BALEARES - ECONOMY PARCEL2 | 74 |
| ENTREGA ESTANDAR INTERNACIONAL | 10 |

## Tests

```bash
npm test
```

## Docs

- [Integration details](docs/INTEGRATIONS.md)
- [QA Checklist](docs/QA_CHECKLIST.md)
