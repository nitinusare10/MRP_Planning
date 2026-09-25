# Dopar MRP

Standalone Material Requirements Planning and procurement planning system for
Dopar Energy's EV motor controller manufacturing. Zoho Inventory remains the
source of truth for transactional data (items, stock, vendors, purchase
orders); this application owns planning data (BOMs, MRP parameters, MRP
calculations, purchase recommendations) and will sync from Zoho via its API.

See [`docs/architecture.md`](docs/architecture.md) for the full approved
architecture, database schema, and the MRP calculation method. This repo is
being built in controlled phases — see that document for what's implemented
vs. planned.

**Status: Phase 0 (project foundation) and Phase 1 (Zoho Inventory
integration foundation) complete.** The Zoho OAuth flow, API client, and
sync jobs for Items/Vendors/Warehouses/Purchase Orders/Purchase
Receipts/Sales Orders/Stock are fully built and tested against mocked Zoho
responses — but no real Zoho app is registered yet, so "Connect to Zoho" is
inert until `ZOHO_CLIENT_ID`/`ZOHO_CLIENT_SECRET`/`ZOHO_REDIRECT_URI`/
`ZOHO_DATA_CENTER` are added. No Master Data UI, BOM, or MRP engine yet —
see "Development phases" in the architecture doc.

## Prerequisites

- Node.js 22+
- PostgreSQL 16+ (with the `btree_gist` extension available)

## Getting started

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL, AUTH_SECRET, etc.
npm run db:migrate:deploy
npm run db:seed         # requires SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env
npm run dev
```

Generate an `AUTH_SECRET` with `openssl rand -base64 32`.

The dev server runs at http://localhost:3000. Sign in at `/login` with the
seeded admin account.

## Scripts

| Command                           | Purpose                                            |
| --------------------------------- | -------------------------------------------------- |
| `npm run dev`                     | Start the Next.js dev server                       |
| `npm run build` / `npm run start` | Production build / run                             |
| `npm run typecheck`               | `tsc --noEmit`                                     |
| `npm run lint`                    | ESLint                                             |
| `npm run format` / `format:check` | Prettier write / check                             |
| `npm run db:migrate`              | Create + apply a new migration (dev)               |
| `npm run db:migrate:deploy`       | Apply existing migrations (CI/prod)                |
| `npm run db:validate`             | Validate `schema.prisma`                           |
| `npm run db:studio`               | Prisma Studio                                      |
| `npm run db:seed`                 | Seed the single dev ADMIN user                     |
| `npm run test`                    | Vitest (unit + integration)                        |
| `npm run test:e2e`                | Playwright (builds and boots the app on port 3100) |

## Testing

- **Unit tests** (`tests/unit`) cover pure logic: password hashing, Zod
  validation, the server-side RBAC helper.
- **Integration tests** (`tests/integration`) run against a real Postgres
  database and exercise the actual constraints/triggers described in
  `docs/architecture.md` — BOM revision uniqueness, the effective-date
  overlap `EXCLUDE` constraint, approved-BOM immutability, circular-BOM
  prevention, single-preferred-vendor, demand-source uniqueness, MRP result
  immutability/traceability, and purchase recommendation → requisition
  consolidation. Point `DATABASE_URL` in `.env.test` at a dedicated test
  database — these tests create and delete real rows.
- **E2E tests** (`tests/e2e`, Playwright) cover the auth/RBAC flow (login,
  invalid credentials, sign-out) and the Zoho integration page (connection
  status, role-gated connect/sync controls, graceful "not configured"
  handling).
- **Zoho tests** (`tests/unit/zoho`, `tests/integration/zoho`) cover OAuth
  config/token exchange/refresh, AES-256-GCM token encryption, the API
  client's retry/backoff/rate-limit/timeout handling, pagination, every
  entity mapper (including the `usableForMrp` rule), idempotent/resumable
  sync against real Postgres with a fake injected Zoho client, and secret
  redaction in `SyncLog`.

Playwright's own TS transform can't load the generated Prisma client (it
uses `import.meta`); e2e tests that need direct DB fixtures talk to Postgres
via `pg` instead of importing `@/lib/db` — see
`tests/e2e/zoho-integration.spec.ts`.

## Project structure

```
prisma/            schema.prisma, migrations, seed.ts
src/
  app/              Next.js App Router pages, API routes
    zoho/           Zoho integration status page + Server Actions
    api/zoho/oauth/callback/   OAuth callback Route Handler
  components/       ui / tables / forms / layout (built out from Phase 2 on)
  lib/
    auth/           password hashing, server-side RBAC
    db/             Prisma client singleton
    errors/         typed AppError hierarchy + API error mapping
    logging/        structured logger (pino)
    mrp/            MRP engine (Phase 6 — empty for now)
    validation/     Zod schemas
    zoho/           Zoho Inventory integration (Phase 1 — built)
      auth/         OAuth flow, encrypted token storage, connection mgmt
      client/       API client: retry/backoff/rate-limit/timeout, pagination
      mappers/      per-entity Zod validation + Zoho -> Prisma mapping
      sync/         generic sync engine + one module per entity
  services/         business logic layer, one module per domain
  types/            ambient type augmentations
  auth.ts / auth.config.ts / proxy.ts   Auth.js configuration (see file comments — split for Edge-runtime compatibility)
tests/
  unit/zoho/  integration/zoho/  e2e/
docs/
  architecture.md   approved system architecture & database schema
  decisions/        architecture decision records
```

## Security notes

- Never commit `.env` or any real Zoho/OAuth credentials — only
  `.env.example` (with placeholders) is tracked.
- Zoho tokens are encrypted at rest (AES-256-GCM, `ZOHO_ENCRYPTION_KEY`) and
  are never sent to the browser; all Zoho API calls happen server-side only.
- Authorization is enforced server-side (`lib/auth/rbac.ts` /
  `requireRole()` inside every Server Action and Route Handler), not just
  hidden in the UI.
- The structured logger and `SyncLog.errorDetails` both redact token-shaped
  values — see `lib/zoho/redact.ts` and `lib/logging/index.ts`.

## Connecting to Zoho (once you have API credentials)

1. Register an app at the Zoho API Console for your data center
   (`api-console.zoho.com` / `.in` / etc.) with redirect URI
   `<your-deployment-url>/api/zoho/oauth/callback`.
2. Set `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REDIRECT_URI`,
   `ZOHO_DATA_CENTER` in `.env` (see `.env.example`).
3. Sign in as an ADMIN, go to `/zoho`, enter the Zoho Organization ID, and
   click **Connect to Zoho**.
4. Once connected, ADMIN/PLANNER users can trigger a sync per entity or all
   at once from the same page.
