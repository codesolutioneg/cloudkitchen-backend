# Cloud Kitchen B2B Backend

Node.js / TypeScript / Express / Prisma / PostgreSQL backend for the Cloud Kitchen B2B platform.

## Prerequisites

- Node.js 20+
- Docker & Docker Compose (for local Postgres/Redis)
- npm

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file and adjust secrets
cp .env.example .env

# 3. Start Postgres (+ Redis) via Docker
docker compose up -d postgres redis

# 4. Run database migrations
npm run db:migrate

# 5. Start the API in development mode
npm run dev
```

The API listens on `http://localhost:3000` by default.

- Health check: `GET /api/v1/health`
- OpenAPI (company): `http://localhost:3000/api/docs/company`
- OpenAPI (dashboard): `http://localhost:3000/api/docs/dashboard`

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start API with hot reload |
| `npm run build` | Compile TypeScript |
| `npm run start` | Run compiled API |
| `npm run db:migrate` | Apply Prisma migrations (dev) |
| `npm run db:migrate:deploy` | Apply migrations (production) |
| `npm run db:seed` | Run seed script |
| `npm run test` | Run Vitest test suite |
| `npm run typecheck` | TypeScript check without emit |
| `npm run lint` | ESLint |

## Docker (full stack)

```bash
docker compose up --build
```

This starts Postgres, Redis, and the API container. Migrations run automatically on API container start.

## Project structure

```
src/
  app.ts              # Express app assembly
  server.ts           # HTTP server bootstrap
  config/             # Zod-validated environment
  core/               # Shared middleware, errors, OpenAPI, utilities
  prisma/             # Prisma client singleton + extensions
  modules/            # Feature modules (routes → controller → service)
  routes/             # Top-level router mounting
prisma/
  schema.prisma       # Database schema (source of truth)
```

## Budget meal planning

Corporate clients (factory canteens) buy meals per head per day against a fixed
budget and a nutrition brief. The planner picks one product per meal component
so a day stays inside the budget while hitting protein, carb and energy targets.

- Give products macros first: `PUT /api/v1/dashboard/catalog/products/{id}/nutrition`.
  Products without nutrition are invisible to the planner.
- Create a brief (`POST /api/v1/dashboard/meal-plans`), then `POST .../generate`.
- `POST /api/v1/dashboard/meal-plans/preview` solves a brief without saving it.
- Budget outranks the nutrition targets: an unreachable brief returns the
  cheapest compliant plan plus warnings, never a silent overspend.
- Lock an item to keep a human pick across a regenerate. Approved plans are
  immutable; duplicate to change one.

The solver lives in `src/engines/mealPlanOptimizer.ts` and is a pure,
deterministic function, so the same brief always yields the same plan.

## Documentation

- Master prompt: `CLOUD_KITCHEN_B2B_BACKEND_MASTER_PROMPT.md`
- Schema reference: `cloud-kitchen-b2b-schema.md`
- Implementation tracker: `IMPLEMENTATION_PROGRESS.md`
