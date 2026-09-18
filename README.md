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

**Status: Phase 0 (project foundation) complete.** No Zoho integration, BOM
explosion, or MRP engine yet — see "Current phase" in the architecture doc.

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
- **E2E tests** (`tests/e2e`, Playwright) cover the auth/RBAC flow end to
  end: unauthenticated redirect, invalid credentials, login, and sign-out.

## Project structure

```
prisma/            schema.prisma, migrations, seed.ts
src/
  app/              Next.js App Router pages, API routes
  components/       ui / tables / forms / layout (built out from Phase 2 on)
  lib/
    auth/           password hashing, server-side RBAC
    db/             Prisma client singleton
    errors/         typed AppError hierarchy + API error mapping
    logging/        structured logger (pino)
    mrp/            MRP engine (Phase 5 — empty for now)
    validation/     Zod schemas
    zoho/           Zoho Inventory integration (Phase 2 — empty for now)
  services/         business logic layer, one module per domain
  types/            ambient type augmentations
  auth.ts / auth.config.ts / proxy.ts   Auth.js configuration (see file comments — split for Edge-runtime compatibility)
tests/
  unit/  integration/  e2e/
docs/
  architecture.md   approved system architecture & database schema
  decisions/        architecture decision records
```

## Security notes

- Never commit `.env` or any real Zoho/OAuth credentials — only
  `.env.example` (with placeholders) is tracked.
- Zoho tokens (once Phase 2 is built) are encrypted at rest and are never
  sent to the browser; all Zoho API calls happen server-side only.
- Authorization is enforced server-side (`lib/auth/rbac.ts`), not just
  hidden in the UI.
