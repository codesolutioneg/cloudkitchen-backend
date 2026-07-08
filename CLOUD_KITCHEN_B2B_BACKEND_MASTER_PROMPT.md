# Cloud Kitchen B2B Platform — Backend Master Prompt (v3, Node.js Edition, A-to-Production)

**Purpose:** Single source of truth for an AI coding agent (Cursor, Claude Code, Devin, etc.) to build the complete backend of the **Enterprise B2B Cloud Kitchen Platform** from scratch, one phase at a time, to a production-ready finish. The agent must produce a deployable, enterprise-grade **Node.js (TypeScript) REST API** backed by **PostgreSQL via Prisma**, matching the architecture, entities, and business flows defined in `cloud-kitchen-b2b-schema.md` (the canonical data-model source of truth) and its compiled, literal implementation `prisma/schema.prisma`.

**Scope:** Backend only. No frontend, mobile, or admin-dashboard UI code. The API serves two structurally distinct client populations — see §2.1 — through one versioned REST surface, fully documented with **OpenAPI/Swagger on every single endpoint, no exceptions**.

**Working folder scope (hard constraint for the implementing agent):** everything you create, edit, or delete lives under `/root/cloudkitchen/`. A reference project exists at `/root/dishflow/backend` — **read-only**, for engineering-pattern inspiration only (see §4.0). Never write, move, or delete anything outside `/root/cloudkitchen/`. This is restated as an enforced Cursor rule in `.cursor/rules/` (§24.5) so it applies automatically, not just as a one-time instruction.

**For the AI:** Treat **MUST** as mandatory and **SHOULD** as strong default (deviate only with a documented reason in code comments). Follow section numbers (§) and prefer the referenced section over duplicated text elsewhere. Wherever this document says "per the schema," resolve ambiguity by re-reading `cloud-kitchen-b2b-schema.md` (especially its **§30 errata pass**) and `prisma/schema.prisma` rather than inventing columns. **Never start writing business-logic code before reading §24 (Phased Execution Protocol) — it defines how work is planned, sequenced, tracked, and verified, and it is not optional.**

---

## Table of Contents

1. [Role & Context](#1-role--context)
2. [Project Summary & Domain Model](#2-project-summary--domain-model)
3. [Tech Stack (Mandatory)](#3-tech-stack-mandatory)
4. [Solution Architecture & Folder Structure](#4-solution-architecture--folder-structure)
5. [Environment & Configuration](#5-environment--configuration)
6. [Database & Persistence Conventions (Prisma)](#6-database--persistence-conventions-prisma)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [API Modules & Endpoints](#8-api-modules--endpoints)
9. [Business Rules Engine — Implementation Notes](#9-business-rules-engine--implementation-notes)
10. [Workflow Engine & Order Lifecycle — Implementation Notes](#10-workflow-engine--order-lifecycle--implementation-notes)
11. [Approval Workflow Engine — Implementation Notes](#11-approval-workflow-engine--implementation-notes)
12. [Feature Management & Dynamic Dashboard — Implementation Notes](#12-feature-management--dynamic-dashboard--implementation-notes)
13. [Catalog, PIM & Menu Assignment — Implementation Notes](#13-catalog-pim--menu-assignment--implementation-notes)
14. [Background Jobs & ERP/POS Integration Engine](#14-background-jobs--erppos-integration-engine)
15. [Centralized File Management](#15-centralized-file-management)
16. [Notifications](#16-notifications)
17. [Localization / Multilingual Support](#17-localization--multilingual-support)
18. [Global Settings & Company Configuration Resolution](#18-global-settings--company-configuration-resolution)
19. [Security (Server & Application)](#19-security-server--application)
20. [Auditing, Logging & Observability](#20-auditing-logging--observability)
21. [API Documentation — Swagger/OpenAPI (Mandatory, Zero Exceptions)](#21-api-documentation--swaggeropenapi-mandatory-zero-exceptions)
22. [Testing & Quality](#22-testing--quality)
23. [Deployment](#23-deployment)
24. [Development Workflow — Phased Execution Protocol](#24-development-workflow--phased-execution-protocol)
25. [Pre-Launch Checklist](#25-pre-launch-checklist)
- [Appendix A — Environment Variables (.env)](#appendix-a--environment-variables-env)
- [Appendix B — Standard API Response Envelope](#appendix-b--standard-api-response-envelope)
- [Appendix C — Business Rule Resolution Algorithm (Reference Pseudocode)](#appendix-c--business-rule-resolution-algorithm-reference-pseudocode)
- [Appendix D — Sample Prisma Model Usage & Auditable Convention](#appendix-d--sample-prisma-model-usage--auditable-convention)
- [Appendix E — Sample Authorization Middleware (Dashboard RBAC)](#appendix-e--sample-authorization-middleware-dashboard-rbac)
- [Appendix F — Tenant Scoping & Soft Delete (Prisma Client Extensions)](#appendix-f--tenant-scoping--soft-delete-prisma-client-extensions)
- [Appendix G — Seed Data Checklist](#appendix-g--seed-data-checklist)

---

## 1. Role & Context

You are a **Principal Backend Engineer** implementing the full backend for a **multi-tenant B2B SaaS Cloud Kitchen platform**. This is explicitly **not** a restaurant app and **not** a POS — it is a centrally-managed catalog served to corporate clients ("Companies") who order in bulk for their own employees/departments, governed entirely by data-driven rules, workflows, and feature entitlements rather than hardcoded application logic.

Output a single Node.js/TypeScript REST API: a modular, service-layered architecture (§4), full coverage of every module in the schema, no unnecessary complexity, and nothing hardcoded that the schema models as a lookup table. Database: PostgreSQL only, via Prisma. Deployment target: Linux VPS or container platform (Node behind Nginx, or Docker/Kubernetes); the **developer** performs infrastructure provisioning and DNS/SSL; you **prepare** the project, migrations, and deployment documentation.

---

## 2. Project Summary & Domain Model

- **Product:** Enterprise B2B ordering platform. A **Super Admin** organization centrally manages one master product catalog (menus, categories, products, pricing) and sells it to onboarded **Companies** (corporate tenants), who order on behalf of their own departments/employees.
- **Tenants** = Companies, each with nested Departments and Company Users. Companies never own catalog data — they only consume curated views of it (`catalog_menus` assigned via `menu_assignments`).
- **Nothing is hardcoded:** roles, permissions, order/workflow statuses, business-rule types, navigation, feature entitlements, and approval steps are all **rows**, not enums baked into application code. Only a handful of genuinely fixed technical states are true PostgreSQL enums (schema §13 / §6.4 below).
- **Revenue/commercial model:** platform sells catalog access + fulfillment to companies under negotiated terms (company-tiered pricing lists, business-rule-driven MOQ/cutoff/notice-period constraints, VAT/service charge/delivery-fee configuration) — no consumer payment/checkout concerns of a B2C marketplace.
- **Fulfillment:** delivery or pickup, tracked through a fully data-defined workflow (§10), with driver/kitchen-status fields pre-modeled as future extension points, not built into v1.
- **Everything about "what a tenant can see and do" is resolved at request time** from `company_modules` / `company_features` / `business_rules` / `menu_assignments` — never from an `if (companyId === ...)` branch in code.

### 2.1 The Two Structurally Distinct Actor Populations (Mandatory Reading)

This is the single most important architectural fact in this system and **must** shape every route, middleware, and service in the codebase. There are **two, and only two**, kinds of human actors, and they are **not symmetrical**:

| | **Company Users** (tenant customers) | **Dashboard Users** (internal platform staff) |
|---|---|---|
| Table | `company_users` | `dashboard_users` |
| Purpose | Register a company, log in, browse the catalog assigned to them, place orders, track them | Operate and administer the entire platform |
| Roles / Permissions? | **None — flat, undifferentiated access to their own company's data** | **Full RBAC**: `roles`, `permissions`, `permission_groups`, `role_permissions`, `role_inheritance`, `policies`, `dashboard_user_roles`, `role_page_permissions` |
| Fixed access surface | Company Profile, Files/Documents, Delivery Addresses, Company Configuration, assigned Catalog Menu(s), Orders + sub-resources scoped to `company_id`, Notifications addressed to them/their company | Whatever `dashboard_pages` + `role_page_permissions` grant, dynamically, per role |
| Examples | Any employee of an onboarded company who logs in | Super Admin, Sales, Operations, Kitchen Manager, Support, Finance, Marketing, Engineering |
| Company-side differentiation | **Do not build it.** If a real future need arises ("only some staff may submit orders above X"), it is expressed as a `business_rules` (§9) threshold evaluated against `company_users.is_primary_contact` — never as RBAC roles/permissions on the company side. A dormant, feature-gated future extension (`company_roles`/`company_permissions`) exists in the schema (§29.3 of the schema doc) — inert until explicitly activated, never touched in v1. |
| Company-assignment scoping | N/A | `dashboard_user_company_scope` + `dashboard_user_company_assignments` — a dashboard user's `scope_type` (`all`/`specific`) explicitly declares whether they see every company or only their assigned subset. **Never** infer "sees all" from an empty assignment set; it must be an explicit, queryable fact. |

**Do not build a unified `users` table/model.** Do not reintroduce a `role`/`permission` relationship on `company_users` under any framing ("tiers," "plans," "capability levels"). The schema explicitly deprecated and split the original unified model for exactly this reason (schema §23, §30.5) — reversing it silently would break the RBAC/audit design throughout the rest of the system.

**Polymorphic actor references:** any column that could originate from either population (`timeline_events.actor_id`, `audit_logs.changed_by`, `order_notes.author_id`, `approval_decisions.decided_by_id`, `files.uploaded_by_id`, `background_jobs.created_by_id`, etc.) **MUST** carry a companion `*_type` discriminator (`company_user`, `dashboard_user`, `system`) and **MUST NOT** be a Prisma relation/FK to either table — resolve the reference in the service layer, exactly as `prisma/schema.prisma` already implements it (see schema doc §30.2 for the exhaustive, corrected list — this superseded a handful of dangling `-> users` references left over from the original design).

### 2.2 Core Architectural Principles (apply to every module you build)

1. **UUID primary keys everywhere** (`gen_random_uuid()`, native in Postgres 13+), never auto-increment ints.
2. **Lookup tables over hardcoded string unions/enums** for anything business-mutable (roles, statuses, rule types, notification channels, document types, event codes). Native PostgreSQL enums (and therefore Prisma `enum`) are reserved exclusively for the four genuinely fixed technical states — see §6.4.
3. **The Auditable column block** (`id, created_at, updated_at, deleted_at, created_by_type, created_by_id, updated_by_type, updated_by_id, is_deleted, version`) is present on every mutable business entity unless the table is explicitly append-only (timeline, audit, history, log tables never get `updated_at`/`deleted_at`/`version`). `created_by`/`updated_by` are **polymorphic** (`*_type` + `*_id`, no FK) per schema §30.1 — there is no single `users` table to point a plain FK at.
4. **Soft delete only.** No hard `DELETE` on business tables from application code. A restore flips `is_deleted` back and is itself audited (`audit_logs.action = 'restore'`).
5. **Optimistic concurrency** via the `version` column — every `UPDATE` is a conditional `updateMany({ where: { id, version }, data: { version: { increment: 1 }, ... } })`; if the affected-row count is 0, throw a 409 conflict. Never a blind `update({ where: { id } })` on a mutable business table.
6. **Row-Level Security readiness**: every tenant-scoped table carries `company_id`; write the tenant-scoping Prisma Client Extension now (Appendix F) so Postgres RLS can be layered on later with zero query-shape changes.
7. **`Json` (jsonb) for genuinely volatile shape**, never for data you will filter/join on at scale without a plan — used deliberately on `products.attributes`, `business_rules.value`, `company_configurations.config_value`, `audit_logs.old_values/new_values`, `timeline_events.metadata`, and similar schema-documented columns only.
8. **Append-only tables are truly append-only.** `timeline_events`, `audit_logs`, `order_status_history`, `*_login_history`, `entity_workflow_history`, `approval_decisions`, `job_execution_logs`, `integration_events`, `company_approval_history`, `global_settings_history`, `company_configuration_history` — never call `.update()`/`.delete()` against these Prisma models from application code; add a Postgres trigger rejecting `UPDATE`/`DELETE` on them as defense in depth (ship it as a raw-SQL migration).
9. **Polymorphic tables never carry a Prisma relation** on their `entity_type`/`entity_id` pair (or `scope_type`/`scope_id`, `*_type`/`*_id` actor pairs) — this is deliberate, matching the schema's stated goal of never blocking deletion or schema evolution of the tables being referenced. Resolve these joins with explicit follow-up queries in the service layer, never a Prisma `include`.
10. **No column ever hardcodes a business concept the schema modeled as a lookup row.** If you find yourself writing `if (status === "delivered")` against a plain string column that has a matching lookup table in the schema, you are doing it wrong — look up the `code`, don't string-compare a magic value scattered across the codebase; centralize such codes as `const` string-literal objects in one file per module (`orderWorkflowCodes.ts`, `ruleTypeCodes.ts`, etc.) referencing the seeded lookup rows, not re-deriving business logic from them.

---

## 3. Tech Stack (Mandatory)

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js 20 LTS | TypeScript throughout, `strict: true` in `tsconfig.json`. |
| Language | TypeScript 5.x | No `any` in business logic; `noUncheckedIndexedAccess` on. |
| Web framework | Express 4.x | Thin controllers, no business logic in route handlers — mirrors the reference project's proven module shape (`{module}.routes.ts` → `{module}.controller.ts` → `{module}.service.ts`). |
| ORM | Prisma 5.x (`@prisma/client`) | `prisma/schema.prisma` (already generated — see §6) is the compiled data model; `prisma migrate dev`/`deploy` for migrations, checked into source control, one migration per module/PR (never one giant initial migration). |
| Database | PostgreSQL 15+ | Single instance for v1; partitioning-ready per schema §16. |
| Validation | Zod | One schema per request DTO (body/query/params), enforced via a shared `validate(schema)` Express middleware; the same Zod schemas double as the OpenAPI source via `@asteasolutions/zod-to-openapi` (§21) — one definition, never two. |
| Mapping | Hand-written mapper functions (`toXResponse(entity)`) per module | Avoid heavy mapping libraries, especially around money/workflow fields — explicit, reviewable mapping only. |
| Request pipeline | Express middleware chain (replaces MediatR/CQRS pipeline behaviors) | Per route, in this order: rate limiter (auth-sensitive routes) → audience auth middleware → `validate(schema)` → tenant/permission authorization middleware → controller → service → (post-response) audit-log write. See §4.2. |
| Authentication | `jsonwebtoken` + `bcryptjs` | Access token (short-lived, e.g. 15 min) + refresh token (7–30 days, DB-backed via `*_refresh_tokens`, rotated on use). **Two separate signing secrets**, one per audience (`company` vs `dashboard`), exactly like the two-audience pattern already proven in the reference project's `authMiddleware`/`adminAuthMiddleware` split. |
| Authorization | Hand-written middleware + a single `IPermissionResolver`-equivalent service | Dashboard RBAC resolved per-request from `roles`/`permissions`/`role_page_permissions` (Appendix E); Company Users authorized purely by tenant-ownership checks (`company_id` match), no policy/role matrix. |
| Password hashing | `bcryptjs` | Store `password_algo` per company/dashboard user row to future-proof algorithm migration. |
| Env validation | Zod (`envSchema.safeParse(process.env)`) at process start | Fail fast (`process.exit(1)`) on any missing/invalid required variable — see §5 and the reference project's `src/config/index.ts` pattern. |
| Background jobs | Custom Postgres-polling worker (`SELECT ... FOR UPDATE SKIP LOCKED` on `background_jobs`) + `node-cron` for `job_schedules` cron ticks | Must honor the schema's `background_jobs`/`job_schedules`/`job_execution_logs` shape (§14) as the literal queue state — do **not** introduce a parallel BullMQ/Redis queue whose state can drift from those tables; Redis/BullMQ may be layered on top later purely as a notification/wake-up mechanism for the poller, never as the source of truth. |
| Caching | `ioredis` (`IORedis`) | Used for resolved navigation, resolved business rules, resolved feature/module flags — all read-heavy/write-light per schema §16.6. Falls back to a simple in-memory `Map` with TTL in local dev when `REDIS_ENABLED=false`. |
| Real-time (optional, order tracking) | `socket.io` | Pushes `timeline_events`/order-status changes to connected clients; never the primary source of truth (Notifications module, §16, remains the durable channel). |
| File storage | Pluggable `IFileStorageProvider` interface (`LocalFileStorageProvider` in dev, `S3FileStorageProvider` in prod) + `multer` for multipart parsing | Backs the `files`/`file_attachments` tables (§15) — never entity-specific upload code paths. |
| Excel import/export | `xlsx` (SheetJS) | For reports and bulk product/company import-export features already reserved in `modules`. |
| Logging | `pino` + `pino-http` | Structured JSON logs to stdout (container-friendly); enrich every log line with `correlationId`/`requestId` matching `audit_logs`/`integration_events`. |
| Error tracking | Sentry (`@sentry/node`) | Initialize only when `SENTRY_DSN` is set. |
| API documentation | `@asteasolutions/zod-to-openapi` + `swagger-ui-express` | Generates a real OpenAPI 3.0 document straight from the same Zod schemas used for request validation; served per audience (`/api/docs/company`, `/api/docs/dashboard`) — see §21. **Every endpoint MUST appear here; this is treated as a build-breaking requirement, not a nice-to-have.** |
| Testing | Vitest + Supertest + a real dockerized Postgres for integration tests | No SQLite/mock-DB substitution for Prisma integration tests (`jsonb`/`citext`-equivalent/`inet`-equivalent behavior needs the real provider). |
| Containerization | Docker (multi-stage build) | `docker-compose.yml` for local Postgres + API + Redis. |
| Process/orchestration | Node process behind Nginx (VPS, via `pm2` or a `systemd` unit) or a container platform | Documented for both in §23. |

---

## 4. Solution Architecture & Folder Structure

**Architecture style:** a **modular monolith** — one module per business domain (mirroring the schema's own module boundaries §1–§29), each internally layered `routes → controller → validation (Zod) → service → Prisma`. This intentionally replaces the "4-project Clean Architecture" shape you may see in .NET references with the idiomatic Node.js equivalent: a single deployable package, strict internal layering enforced by code review/lint rules rather than compiler-enforced project boundaries. The separation of concerns is the same; the packaging is not.

### 4.0 Using `/root/dishflow/backend` as a pattern reference (read-only)

`/root/dishflow/backend` is a working Node.js + TypeScript + Express + Prisma + Zod project and is a **valid** engineering-pattern reference for this stack (unlike a mismatched-language reference would be) — inspect it for: module folder shape (`{module}.routes.ts`/`.controller.ts`/`.service.ts`), the `AppError` hierarchy + central `errorHandler`, the response envelope shape, the `validate()` middleware, the dual-audience auth middleware split (`authMiddleware` vs `adminAuthMiddleware` — directly analogous to `company` vs `dashboard`), Zod-based env config with fail-fast validation, Pino logging setup, rate limiting, and file upload handling.

**Never** copy DishFlow's business logic, Prisma models, workflows, or anything domain-specific (restaurants/branches/Odoo-menu-sync are DishFlow's own business, not this platform's). **Never** treat DishFlow as a source of truth for entities or endpoints — `cloud-kitchen-b2b-schema.md` + `prisma/schema.prisma` + this document always win on any conflict. **Never** write to `/root/dishflow` — read-only, always (§24.5 enforces this as a Cursor rule).

### 4.1 Folder structure

```
cloudkitchen/
└── backend/
    ├── cloud-kitchen-b2b-schema.md          # canonical data model (source of truth, read before coding)
    ├── CLOUD_KITCHEN_B2B_BACKEND_MASTER_PROMPT.md   # this document
    ├── IMPLEMENTATION_PROGRESS.md            # phase/batch/task tracker — updated after EVERY task (§24)
    ├── prisma/
    │   ├── schema.prisma                     # compiled, authoritative Prisma schema (already generated)
    │   ├── migrations/                       # one migration per module/PR
    │   └── seed.ts                           # Appendix G seed data
    ├── src/
    │   ├── server.ts                         # process entrypoint (listen, graceful shutdown)
    │   ├── app.ts                            # Express app assembly: middleware, routes, error handler
    │   ├── config/
    │   │   └── index.ts                      # Zod-validated env config, fail-fast on boot
    │   ├── prisma/
    │   │   └── client.ts                     # singleton PrismaClient + tenant-scope/soft-delete/audit extensions (Appendix D/F)
    │   ├── core/
    │   │   ├── errors/                       # AppError hierarchy, errorCodes, central errorHandler
    │   │   ├── middleware/                   # companyAuth, dashboardAuth, validate, rateLimiter, requestContext (AsyncLocalStorage), upload, asyncHandler
    │   │   ├── openapi/                      # zod-to-openapi registry + swagger-ui wiring (§21)
    │   │   └── utils/                        # jwt, response envelope, pagination, logger, orderNumber, otp, etc.
    │   ├── engines/                          # the cross-cutting "engines" the schema calls for — never duplicated per-module
    │   │   ├── businessRuleResolver.ts       # §9
    │   │   ├── workflowEngine.ts             # §10
    │   │   ├── approvalEngine.ts             # §11
    │   │   ├── permissionResolver.ts         # §7.3 / Appendix E
    │   │   ├── moduleFeatureResolver.ts      # §12
    │   │   ├── menuResolver.ts               # §13
    │   │   ├── configResolver.ts             # §18
    │   │   └── localizationResolver.ts       # §17
    │   ├── jobs/
    │   │   ├── worker.ts                     # background_jobs poller (§14)
    │   │   └── scheduler.ts                  # job_schedules → node-cron ticks
    │   ├── modules/
    │   │   ├── auth/                         # §7 — shared login/refresh/OTP, split by actorType
    │   │   ├── company-onboarding/           # §8.1
    │   │   ├── dashboard-users-rbac/         # §8.2
    │   │   ├── catalog/                      # §8.3 (PIM)
    │   │   ├── menus/                        # §8.4
    │   │   ├── business-rules/               # §8.5
    │   │   ├── settings/                     # §8.6
    │   │   ├── orders/                       # §8.7
    │   │   ├── tracking-notifications-audit/ # §8.8
    │   │   ├── features-dashboard/           # §8.9
    │   │   ├── approval-workflows/           # §8.10
    │   │   ├── background-jobs/              # §8.11 (read-only/observability API)
    │   │   ├── files/                        # §8.12
    │   │   └── integrations/                 # §8.13
    │   └── routes/
    │       └── index.ts                      # mounts every module router under /api/v1
    ├── tests/
    │   ├── unit/                             # one folder per engine/service
    │   └── integration/                      # Supertest + real Postgres, one file per module
    ├── docker-compose.yml
    ├── Dockerfile
    ├── .env.example
    ├── package.json
    ├── tsconfig.json
    └── README.md
```

- **Routes:** parse nothing beyond what Express gives them; wire `validate(schema)` + auth/authorization middleware; delegate to the controller.
- **Controllers:** call exactly one service method, map the result to the standard envelope (Appendix B), set the HTTP status. No Prisma import in a controller, ever.
- **Services:** own all business logic, orchestrate the engines (`businessRuleResolver`, `workflowEngine`, etc.) and Prisma. Fully unit-testable without HTTP (pass a mocked/child Prisma client or use dependency injection via plain function parameters — no DI container needed at this scale).
- **Prisma:** the only layer allowed to import `@prisma/client` directly, other than the singleton in `src/prisma/client.ts`.

### 4.2 Request pipeline (apply to every mutating/sensitive route, in this order)

1. **Rate limiter** — `express-rate-limit` (+ `rate-limit-redis` store in prod), stricter policy on `/auth/*`.
2. **Audience auth middleware** (`companyAuthMiddleware` / `dashboardAuthMiddleware`) — verifies the JWT against the correct audience + secret, rejects cross-audience tokens at this layer, before any authorization logic runs. Populates `req.actor` (`{ type, id, companyId? }`) and seeds the AsyncLocalStorage request context used by the Prisma tenant-scoping extension (Appendix F).
3. **`validate(schema)`** — Zod-parses body/query/params; on failure, throws a `ValidationError` → 422, mapped to the standard envelope (Appendix B). The exact same schema feeds the OpenAPI doc (§21).
4. **Authorization middleware** — re-checks tenant ownership (`company_id` matches the caller's company for Company User requests) even though the route's own scoping already narrows it; for Dashboard User requests, calls the Permission Resolver (Appendix E) for the page/permission the route represents. Defense in depth against IDOR.
5. **Controller → Service** executes; multi-aggregate writes (e.g., an order + its workflow instance + its timeline event) run inside a single `prisma.$transaction(...)`.
6. **Audit write** (mutating routes only) — the Prisma audit extension (Appendix D) diffs tracked writes and inserts the corresponding `audit_logs` row automatically; handlers never hand-roll this.
7. **Central `errorHandler`** — catches everything thrown anywhere above, maps known `AppError` subclasses to their status/code, logs unexpected errors via Pino + Sentry, always returns the standard envelope.

---

## 5. Environment & Configuration

Bind all configuration through a single Zod schema (mirroring the reference project's `src/config/index.ts`) parsed once at process start with `envSchema.safeParse(process.env)`; the app **MUST** exit immediately (`process.exit(1)`, with every missing/invalid variable printed) if a required value is missing. Canonical variables:

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` \| `production` \| `test` |
| `PORT` | Yes | default `3000` |
| `DATABASE_URL` | Yes | Postgres connection string (Prisma format) |
| `JWT_COMPANY_ACCESS_SECRET`, `JWT_COMPANY_REFRESH_SECRET` | Yes | ≥32 chars — company-audience tokens |
| `JWT_DASHBOARD_ACCESS_SECRET`, `JWT_DASHBOARD_REFRESH_SECRET` | Yes | ≥32 chars, **different** from the company secrets — a leaked company-side token must never be usable against dashboard routes |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Yes | e.g. `15m`, `14d` |
| `CORS_ORIGINS` | Yes | comma-separated, distinct origins for the company client and the dashboard client |
| `REDIS_ENABLED`, `REDIS_URL` | Yes / conditional | required if `REDIS_ENABLED=true` |
| `OTP_PROVIDER` | Yes | `mock` \| `twilio` \| `<regional-provider>` |
| `OTP_PEPPER` | Yes | ≥32 chars |
| `FILE_STORAGE_PROVIDER` | Yes | `local` \| `s3` \| `azure_blob` |
| `FILE_STORAGE_S3_*` | Conditional | required if provider = `s3` |
| `NOTIFICATIONS_EMAIL_*`, `NOTIFICATIONS_SMS_*`, `NOTIFICATIONS_PUSH_*` | Conditional | per enabled channel, see §16 |
| `SENTRY_DSN` | No | leave empty to disable |
| `LOG_LEVEL` | Yes | `trace`\|`debug`\|`info`\|`warn`\|`error`\|`fatal`, default `info` |
| `INTEGRATIONS_DEFAULT_EXTERNAL_SYSTEM` | No | seed value for `external_systems`, e.g. `odoo` — inert until switched on, per schema §19 |
| `BUSINESS_DEFAULT_CURRENCY`, `BUSINESS_DEFAULT_TIMEZONE`, `BUSINESS_DEFAULT_LANGUAGE` | Yes | platform-level fallback used only when a company hasn't set its own |

See **Appendix A** for the full `.env.example` skeleton.

---

## 6. Database & Persistence Conventions (Prisma)

### 6.1 Source of truth

`cloud-kitchen-b2b-schema.md` is authoritative for every table/column/index/constraint's *intent*; `prisma/schema.prisma` (already generated in this repo, sitting next to this document) is its literal, compiled, ready-to-migrate expression, **with the §30 errata pass already applied** (polymorphic actor columns, deprecated-table removal, narrowed enums). Do not hand-edit `prisma/schema.prisma` to "simplify" something back to the pre-§30 shape — if you believe the Prisma file is wrong, fix it and cross-check against schema §30, don't silently diverge.

### 6.2 Naming & mapping

- Table names in Postgres: `snake_case`, plural, exactly as in the schema doc (`company_users`, `catalog_menu_products`, `dashboard_user_company_scope`, …) — already wired via `@@map(...)` in `prisma/schema.prisma`.
- Prisma model/field names: the schema already uses `snake_case` field names directly (matching the reference project's convention) with `PascalCase` model names — do not rename fields to `camelCase`; consistency with the raw SQL column names keeps raw queries, seed scripts, and the markdown doc trivially cross-referenceable.
- Every model inherits the Auditable field set (§2.2.3) unless it is one of the documented append-only/log tables, which instead carry only their single log-specific timestamp (`occurred_at`/`changed_at`/`created_at`) — no `updated_at`/`deleted_at`/`version`.

### 6.3 Migrations

- One `prisma migrate dev --name <module_name>` per logical module/PR (`add_companies_onboarding`, `add_business_rules_engine`, `add_workflow_engine`, …) — never one giant "init" migration for the whole schema; this preserves reviewability and matches the schema's own module boundaries (§1–§29 of the schema doc).
- Every migration that adds a nullable FK/column to an existing table **MUST** be additive-only — never drop or retype an existing column in the same migration that adds a new one, mirroring the schema's own "additive only, no breaking changes" discipline (schema §22).
- After generating each migration, hand-review the generated SQL before applying it — Prisma's diff engine is very good but does not know about the append-only trigger requirement (§2.2.8) or BRIN index conversions (§6.6); add those as a manual follow-up SQL block in the same migration file.

### 6.4 True PostgreSQL enums (the only four — already modeled as Prisma `enum` in `schema.prisma`)

```prisma
enum CompanyStatus { pending active suspended blocked closed }
enum ApprovalStatus { pending under_review approved rejected resubmission_required }
enum DocumentVerificationStatus { pending verified rejected }
enum FulfillmentType { delivery pickup }
```
**Every other status-like column in the system is a `String` referencing a lookup table** (`rule_types`, `workflow_steps.code`, `notification_templates.channel`, `document_type`/`attachment_type`, `event_code`, …) — do not promote any of them to a Prisma `enum`, even if it looks "obviously fixed" (this was already tried and reverted in the schema's own design history for exactly the maintenance reasons above).

### 6.5 Multi-tenancy & soft-delete scoping (Prisma Client Extensions replace EF Core's global query filters)

Prisma has no built-in "global query filter" concept — the idiomatic Node.js equivalent is a **Prisma Client Extension** (`$extends`) layered on the singleton client in `src/prisma/client.ts`, combined with **`AsyncLocalStorage`** to carry the current request's actor/tenant context without threading it through every function call. See **Appendix F** for the full implementation pattern:

- A soft-delete extension rewrites every `findMany`/`findFirst`/`findUnique`/`count` on models carrying `is_deleted` to inject `where: { is_deleted: false }` unless the caller explicitly opts in to `includeDeleted: true`.
- A tenant-scoping extension does the same for every model carrying `company_id`, reading the current actor from `AsyncLocalStorage`: Company Users are always constrained to their own `company_id`; Dashboard Users bypass tenant filtering by default, **subject to** the `dashboard_user_company_scope`/`dashboard_user_company_assignments` resolution (schema §29) applied explicitly wherever a "list companies"-shaped query happens (this one is a deliberate, visible service-layer join, not something to silently bury inside the global extension, since it isn't a blanket allow/deny — it is itself a data-scoping query).
- Row-Level Security (Postgres `CREATE POLICY`) is **not** implemented in v1 per schema §0.1 ("RLS-ready", not "RLS-enabled") — but every migration must leave the `company_id` column and index in place so RLS can be added later purely at the database layer, with no application code change.

### 6.6 Indexing

Mirror schema §15 exactly: btree on every `company_id` FK, composite btree on every polymorphic `(entity_type, entity_id)` pair, and partial-unique-equivalent constraints wherever "exactly one active/default row" semantics apply (`company_addresses` default-per-type, `company_configurations` active-per-key, `languages` default) — Prisma doesn't support partial unique indexes natively in the schema DSL, so express these as a raw-SQL block appended to the relevant migration (`CREATE UNIQUE INDEX ... WHERE is_default = true`). For the high-volume append-only tables called out in schema §15 (`timeline_events.occurred_at`, `audit_logs.changed_at`, `*_login_history.occurred_at`, `background_jobs.scheduled_at`, `integration_events.occurred_at`), `prisma/schema.prisma` ships a standard btree `@@index` today — convert these to `USING BRIN` via a manual follow-up migration once you're actually at production scale (§15/§30.6 of the schema doc), not before. Do not add GIN indexes on `Json` columns speculatively — add them only once a real query pattern against a specific jsonb key is implemented, per schema §15's explicit guidance (again, as a manual raw-SQL migration block).

---

## 7. Authentication & Authorization

### 7.1 Two token audiences, never interchangeable

Issue JWTs with a distinct `aud` claim and a distinct signing secret for each actor population (§2.1):

| Claim | Company User token | Dashboard User token |
|---|---|---|
| `aud` | `company` | `dashboard` |
| `sub` | `company_users.id` | `dashboard_users.id` |
| `companyId` | present, immutable for the token's lifetime | absent |
| `roles` / `permissions` | **absent — there is no concept to include** | resolved role codes at issue time; effective permissions are re-validated against `role_page_permissions`/`role_permissions` on every dashboard request rather than trusted from a stale token for high-sensitivity actions |

`companyAuthMiddleware` and `dashboardAuthMiddleware` (two distinct Express middlewares, never one parameterized "auth middleware" that branches internally) **MUST** reject a `company`-audience token on any `/api/v1/dashboard/*` route and vice-versa, verified with the correct secret for that audience — before any authorization logic runs.

### 7.2 Company User auth flow

Register → OTP verify (`company_user_otp_codes`) → login → access + refresh token pair (`company_user_sessions`/`company_user_refresh_tokens`). No role/permission claims are ever attached — authorization for company routes is purely "does this `company_id` match the resource's `company_id`," enforced by the tenant-scoping Prisma extension (§6.5) plus an explicit ownership check in each service method.

### 7.3 Dashboard User auth flow & permission resolution

Login → access + refresh token pair (`dashboard_user_sessions`/`dashboard_user_refresh_tokens`). On every authorized request, resolve effective access as (schema §23.5, §2.10):

```
effectiveCapability(dashboardUserId, pageOrPermission):
    1. role_page_permissions   → fast boolean CRUD+workflow check for the current dashboard_pages row
    2. role_permissions        → open-ended permission codes for cross-cutting/non-page-scoped actions
    3. role_inheritance        → parent role's permissions apply transitively
    4. permission_overrides    → per-dashboard-user exception (§30.3 narrowed this to dashboard_user scope only), most specific wins, explicit deny beats allow
    5. policies (ABAC)         → evaluated last, only if the above didn't produce a definitive answer (future escape hatch, wire the evaluator now even if no policies are seeded yet)
```
Implement this as a single `permissionResolver.ts` service (cached per dashboard user in Redis/in-memory with a short TTL, invalidated on role/permission write) rather than re-querying the five tables inline in every handler. See Appendix E.

### 7.4 Session & credential hygiene

- Refresh tokens: hashed at rest (`token_hash`), rotated on every use, old token immediately revoked (`revoked_at`), rotation chain tracked via `replaced_by_token_id`.
- `company_user_login_history` / `dashboard_user_login_history` written on every attempt, success or failure, append-only, never trimmed by the application (retention/purge is an ops decision, not a code path).
- MFA: `mfa_enabled` flag exists on `dashboard_users`; **MUST** implement TOTP-based MFA for Dashboard Users before go-live given elevated access — Company Users MFA is a documented future enhancement.
- Password reset & OTP tables (both split per-audience, §30.2 of the schema doc) are single-use, expiring, with `attempt_count` rate limiting.

---

## 8. API Modules & Endpoints

Group Express routers by module, mirroring the schema's module numbering so any future schema change maps 1:1 to a known router file. **Every endpoint below returns the standard envelope (Appendix B), is versioned under `/api/v1`, and MUST be registered in the OpenAPI registry (§21) in the same commit that adds it — a PR that adds an undocumented endpoint is incomplete, not "documented later."**

### 8.1 Company Onboarding (`/api/v1/company/onboarding`, `/api/v1/dashboard/companies`)

| # | Scenario | Endpoint | Notes |
|---|---|---|---|
| 1 | Self-signup a company | `POST /company/onboarding/register` | Creates `companies` (`status=pending`, `approval_status=pending`) + first `company_users` row (`is_primary_contact=true`). |
| 2 | Upload onboarding documents | `POST /company/onboarding/documents` | Writes to `files` + `file_attachments` (§15), `attachment_type` per the document-type list (`trade_license`, `commercial_registration`, `tax_certificate`, `logo`, `authorization_letter`, `bank_letter`, `other`). |
| 3 | Add billing/delivery address | `POST /company/onboarding/addresses` | Enforces the partial-unique "one default per address_type" constraint at the DB level (raw-SQL migration, §6.6); service catches the constraint violation and returns a clean 409. |
| 4 | Dashboard: list pending companies | `GET /dashboard/companies?approvalStatus=pending` | Scoped by the caller's `dashboard_user_company_scope` resolution (schema §29). |
| 5 | Dashboard: approve/reject a company | `POST /dashboard/companies/:id/approve`, `/reject` | Writes `company_approval_history` (append-only) **and** advances the `approval_requests`/`approval_decisions` instance if this company's onboarding uses the generic Approval Workflow Engine (§11) rather than the simpler direct flag flip. |
| 6 | Dashboard: verify a document | `PATCH /dashboard/companies/:id/documents/:attachmentId/verify` | Updates `file_attachments.verification_status`, `verified_by`, `verified_at`. |
| 7 | Get my company profile | `GET /company/profile` | Company User's own `companies` row only — 403 on any other company id, never a 404 (don't leak existence). |

### 8.2 Users, Roles & Dashboard RBAC (`/api/v1/dashboard/users`, `/api/v1/dashboard/roles`)

| # | Scenario | Endpoint | Notes |
|---|---|---|---|
| 1 | Invite a dashboard user | `POST /dashboard/users` | `status=invited`; sends an invitation notification (§16). |
| 2 | Assign role(s) to a dashboard user | `POST /dashboard/users/:id/roles` | Writes `dashboard_user_roles`. |
| 3 | Manage a role's page permissions | `PUT /dashboard/roles/:id/page-permissions` | Bulk upsert into `role_page_permissions`. |
| 4 | Manage a role's cross-cutting permissions | `PUT /dashboard/roles/:id/permissions` | Bulk upsert into `role_permissions`, supports `effect=deny`. |
| 5 | Declare a dashboard user's company scope | `PUT /dashboard/users/:id/company-scope` | Writes `dashboard_user_company_scope` (`scope_type`) + `dashboard_user_company_assignments` when `specific`. |
| 6 | List company users (read-only, support use case) | `GET /dashboard/companies/:id/users` | Dashboard-only visibility; company users cannot list each other via API beyond their own profile. |

### 8.3 Product Information Management — PIM (`/api/v1/dashboard/catalog`, `/api/v1/company/catalog`)

| # | Scenario | Endpoint | Notes |
|---|---|---|---|
| 1 | Dashboard: CRUD categories (nested) | `GET/POST/PATCH/DELETE /dashboard/catalog/categories` | Self-referencing tree via `parent_category_id`; delete is soft-delete only. |
| 2 | Dashboard: CRUD products | `GET/POST/PATCH/DELETE /dashboard/catalog/products` | `attributes` jsonb accepts arbitrary future nutrition/allergen keys without a schema change — validate shape loosely with a permissive Zod `record`, don't over-constrain. |
| 3 | Dashboard: manage translations | `PUT /dashboard/catalog/products/:id/translations/:lang` | `product_translations`, unique per `(product_id, language_code)`. |
| 4 | Dashboard: manage variants/options | `POST/PATCH /dashboard/catalog/products/:id/variants`, `/option-groups` | |
| 5 | Dashboard: manage tiered pricing | `POST /dashboard/catalog/pricing-lists`, `/prices`, `/company-assignment` | Company-tiered pricing per schema §3.9. |
| 6 | Company: browse assigned catalog | `GET /company/catalog/menu` | Resolves the effective `catalog_menu` for the caller via `menu_assignments` scope resolution (§13) — **never** exposes raw `products` unfiltered by an assignment; `visibility=restricted` products only ever reach a company through an explicit `catalog_menu_products` row. |

### 8.4 Menu Assignment (`/api/v1/dashboard/menus`)

| # | Scenario | Endpoint | Notes |
|---|---|---|---|
| 1 | Dashboard: CRUD catalog menus + sections | `/dashboard/menus`, `/dashboard/menus/:id/sections` | |
| 2 | Dashboard: attach products to a section | `POST /dashboard/menus/:id/sections/:sectionId/products` | Never duplicates the product row — writes `catalog_menu_products` only. |
| 3 | Dashboard: assign a menu to a scope | `POST /dashboard/menus/:id/assignments` | `scope_type` ∈ `company/department/user/campaign`; resolution order documented in §13. |

### 8.5 Business Rules & Calendars (`/api/v1/dashboard/rules`)

See §9 for the resolution engine. Endpoints are CRUD over `rule_types`, `business_rules`, `calendars`, `calendar_events` — every "ordering setting" (MOQ, cutoff time, blackout dates, notice hours, VAT, service charge…) is created here as data, never as a new endpoint or column.

### 8.6 Company Configuration & Global Settings (`/api/v1/company/settings`, `/api/v1/dashboard/settings`)

CRUD over `company_configurations` (company-scoped, versioned) and `global_settings` (platform-scoped, versioned) per the resolution contract in §18.

### 8.7 Orders (`/api/v1/company/orders`, `/api/v1/dashboard/orders`)

| # | Scenario | Endpoint | Notes |
|---|---|---|---|
| 1 | Company: place an order | `POST /company/orders` | Validates business rules (MOQ/MaxOQ/cutoff/notice/blackout, §9), snapshots product name/price into `order_items`, creates the initial `entity_workflow_instances` row (§10), writes the first `timeline_events` row. Runs inside one `prisma.$transaction`. |
| 2 | Company: list/detail my orders | `GET /company/orders`, `/company/orders/:id` | Tenant-scoped by the Prisma extension; includes resolved current workflow step + `order_status_history` for the timeline UI. |
| 3 | Company: cancel an order | `POST /company/orders/:id/cancel` | Only legal if the current workflow step allows a `cancelled` transition (§10) — reject with a clear error otherwise, don't silently no-op. Writes `order_cancellations` with `cancelled_by_type='company_user'`. |
| 4 | Dashboard: transition an order's status | `POST /dashboard/orders/:id/transitions` | Delegates entirely to the Workflow Engine (§10); the controller never flips a status column directly. |
| 5 | Dashboard/Company: approve/reject (multi-level) | `POST /orders/:id/approvals/:level/decide` | Backed by `order_approvals` (lightweight, `approver_type`+`approver_id`) and/or the generic Approval Workflow Engine (§11) if the company's approval workflow requires multi-approver quorum. |
| 6 | Add an order note/attachment | `POST /orders/:id/notes`, `/attachments` | `is_internal=true` notes never serialize into the Company User-facing response; attachments go through `files`+`file_attachments` (§15), not a dedicated `order_attachments` table (superseded, schema §30.5). |

### 8.8 Tracking, Notifications, Audit (`/api/v1/company/*`, `/api/v1/dashboard/audit`)

- `GET /company/orders/:id/tracking` — reads `timeline_events` filtered `entity_type='order'`.
- `GET /company/notifications`, `POST /company/notifications/:id/read` — `notifications` scoped to the caller (`recipient_type='company_user'`) or their company (`recipient_company_id`).
- `GET /dashboard/audit-logs?entityName=&entityId=&correlationId=` — read-only, paginated, over `audit_logs`; **never** exposed to Company Users.

### 8.9 Feature Flags, Modules, Dynamic Dashboard (`/api/v1/dashboard/features`, `/api/v1/me/*`)

- `GET /me/modules` — resolves `company_modules` ⋈ `company_features` into a flat `{ code: boolean }` payload for the calling Company User's company (§12), short-TTL Redis-cached.
- `GET /me/navigation` (dashboard only) — resolves `dashboard_pages` ⋈ `role_page_permissions` into a tree for the caller's role(s) (§12).
- Dashboard CRUD over `features`, `feature_groups`, `modules`, `company_features`, `company_modules`, `feature_flags`, `dashboard_pages`, `role_page_permissions`.

### 8.10 Approval Workflow Engine (`/api/v1/dashboard/approval-workflows`)

CRUD over `approval_workflows`, `approval_workflow_steps`; read-only + decide endpoints over `approval_requests`/`approval_decisions` — see §11.

### 8.11 Background Jobs (`/api/v1/dashboard/jobs`) — internal/observability only

Read-only listing + retry/cancel actions over `background_jobs`, `job_schedules`, `job_execution_logs`. Never exposed to Company Users. No endpoint directly enqueues arbitrary jobs from client input — jobs are enqueued by service-layer code, not by a generic "create job" API, to avoid turning this into an unauthenticated task-execution surface.

### 8.12 Files (`/api/v1/*/files`)

`POST /files` (multipart via `multer`) → writes `files` + one or more `file_attachments` rows; `GET /files/:id` streams/redirects per `storage_provider`; deletion is soft (`file_attachments` is versioned/deleted via the Auditable-equivalent fields it carries — see `prisma/schema.prisma`) until a retention job runs — reserved for later.

### 8.13 Integrations (`/api/v1/dashboard/integrations`) — schema-only in v1, wire the surface, not the sync

CRUD over `external_systems`; read-only over `external_system_mappings`, `integration_events`. No outbound HTTP calls to any real ERP in v1 — the endpoints exist so the tables are exercised and the future sync worker has somewhere to read/write.

---

## 9. Business Rules Engine — Implementation Notes

Every "ordering rule"/"admin setting" (MOQ, MaxOQ, minimum notice hours, allowed delivery days, cutoff time, blackout dates, VAT rate, service charge, delivery fee, feature toggles like enable-coupons) is a **row**, not a column, not a config file, not an env var. Implement one `businessRuleResolver.ts` service:

```
resolve(ruleTypeCode, companyId, departmentId?, userId?, productId?, categoryId?, atInstant):
    candidates = businessRules.findMany({
        where: {
            rule_type: { code: ruleTypeCode },
            effective_from: { lte: atInstant },
            OR: [{ effective_to: null }, { effective_to: { gt: atInstant } }],
            OR: [
                { scope_type: 'platform' },
                { scope_type: 'company', scope_id: companyId },
                { scope_type: 'department', scope_id: departmentId },
                { scope_type: 'user', scope_id: userId },
                { scope_type: 'product', scope_id: productId },
                { scope_type: 'category', scope_id: categoryId },
            ],
        },
    })
    winner = candidates.sort by (priority DESC, scopeSpecificityRank(scope_type) DESC)[0]
    return winner?.value  // Json, shape defined by rule_types.value_schema
```
"Scope specificity" ranks `platform < company < department < user/product/category` unless an explicit `priority` overrides it — document the exact tie-break order you implement in code comments, since the schema deliberately leaves the fine-grained tie-break to the application layer. Cache resolved values per `(ruleTypeCode, scope)` in Redis with a short TTL, invalidated on any `business_rules` write for that type/scope. See Appendix C for full pseudocode.

**Never** hardcode a rule type as a column on `orders`/`companies`/`products`. Adding "max weekly order count" later is a `rule_types` insert + UI wiring, not a migration — enforce this discipline in code review.

---

## 10. Workflow Engine & Order Lifecycle — Implementation Notes

Order (and any future entity) status is **never** a column with hardcoded values — it lives entirely in `entity_workflow_instances.current_step_id`, resolved through `workflows`/`workflow_steps`/`workflow_transitions`.

- On order creation: resolve the applicable `workflows` row (company-specific override if one exists, else the global default template, per schema §7.1), find its `initial` step, create `entity_workflow_instances` (`entity_type='order'`), write the first `entity_workflow_history` row (`actor_type`/`actor_id` per schema §30.2) and the first `timeline_events` row.
- On every transition request: look up `workflow_transitions` for `(workflow_id, from_step_id=current, to_step_id=requested)`; if none exists, reject — do not allow an ad-hoc status jump. Evaluate any attached `workflow_conditions` (Json expression) before allowing it. Check `required_permission_id` for manual dashboard-triggered transitions via the Permission Resolver (§7.3).
- On entering a step: execute any `workflow_actions` attached to it (`notify`, `webhook`, `auto_transition`, `escalate`) — implement as a small in-process dispatcher keyed by `action_type`, extensible without a migration.
- SLA/escalation: `workflow_steps.sla_minutes` + `entity_workflow_instances.sla_due_at` — the background worker (§14) scans for overdue instances on a schedule and fires the `escalate` action.
- Maintain `order_status_history` as the schema instructs — a denormalized, fast-read convenience log **in addition to** (never instead of) the generic `entity_workflow_history`.

---

## 11. Approval Workflow Engine — Implementation Notes

A separate, reusable concern from the status state-machine above (schema §24): "this entity needs sign-off from N people/roles before it proceeds." Compose, don't duplicate — a `workflow_transitions` row can have a `workflow_actions.action_type = 'require_approval'` that creates an `approval_requests` instance; the order/company stays on its current workflow step until that approval instance resolves.

- `approval_workflow_steps.approver_type` drives who may decide: `role` (any dashboard user holding that role, resolved via `dashboard_user_roles`), `dashboard_user` (a named individual), or `dynamic_rule` (resolved at runtime against a `business_rules` row, e.g. "approver = requester's assigned account manager").
- Support both sequential (`step_order` strictly gates the next step) and parallel/quorum (`required_approval_count > 1`, count `approval_decisions` for the current `step_order`) approval.
- Company registration approval **may** be modeled through this engine (retaining `company_approval_history` as the lightweight append-only trail) rather than the simpler direct approve/reject flag — implement whichever the product decides, but keep both tables' semantics intact per schema §24's stated relationship.
- `approval_decisions.decided_by_type`/`decided_by_id` and `approval_requests.requested_by_type`/`requested_by_id` are already polymorphic in `prisma/schema.prisma` — resolve them in the service layer, never join them via Prisma `include`.

---

## 12. Feature Management & Dynamic Dashboard — Implementation Notes

Two independent axes, resolved together, never conflated:

1. **Fine-grained features** (`features`/`feature_groups`/`company_features` for company-audience; `dashboard_role_features` for dashboard-audience) — individual toggleable capabilities (Bulk Orders, Favorites, Export Excel…).
2. **Coarse modules** (`modules`/`company_modules` for company-audience; `dashboard_role_modules` for dashboard-audience) — whole platform sections, disambiguated by `modules.audience` (schema §23.6). **Module OFF always wins** regardless of the feature-level flag underneath it — implement this as a single resolver function, never two independent checks that a future refactor could desync:

```
isAvailable(companyOrRole, featureCode):
    feature = features.findUnique({ where: { code: featureCode } })
    moduleEnabled = resolveModule(companyOrRole, feature.module_id)
    if (!moduleEnabled) return false
    return resolveFeature(companyOrRole, feature.id)
```

Dashboard navigation is served **exclusively** from `dashboard_pages` + `role_page_permissions` (schema §23.4 — the superseded `navigation_menus`/`pages`/`routes`/`menu_groups`/`navigation_assignments` tables are **not implemented at all**, schema §30.5 — do not build them "for completeness"). Company Users get a fixed, non-configurable, hardcoded-in-the-frontend screen set — **do not** build a navigation-resolution endpoint for them; `GET /me/modules` (flat feature flags) is all they need.

---

## 13. Catalog, PIM & Menu Assignment — Implementation Notes

- Products are owned exclusively by Super Admin — **no** `company_id` anywhere in the PIM module. A Company User never creates/edits a product.
- A Company only ever sees the subset of products reachable through `menu_assignments` → `catalog_menu_sections` → `catalog_menu_products` for a scope that matches them (`company`, their `department`, their specific `user` id, or an active `campaign`). Resolve with:

```
resolveEffectiveMenu(companyId, departmentId?, userId?, atInstant):
    candidates = menuAssignments.findMany({
        where: {
            is_active: true,
            effective_from: { lte: atInstant },
            OR: [{ effective_to: null }, { effective_to: { gt: atInstant } }],
            OR: [
                { scope_type: 'company', scope_id: companyId },
                { scope_type: 'department', scope_id: departmentId },
                { scope_type: 'user', scope_id: userId },
            ],
        },
        orderBy: [{ priority: 'desc' }, { effective_from: 'desc' }],
    })
    return candidates[0]?.catalog_menu_id
```
- `products.visibility = 'restricted'` means the product is invisible to every Company User **unless** reachable via the resolved menu above — never leak it through a generic "search all products" endpoint on the company side.
- Tiered/company-specific pricing (`product_pricing_lists`/`product_prices`/`company_pricing_list_assignment`) resolves similarly to business rules: company assignment wins over the pricing list's own default flag.

---

## 14. Background Jobs & ERP/POS Integration Engine

- Every async task — ERP sync, notification dispatch, Excel import/export, scheduled reports — is a `background_jobs` row differentiated by `job_type`, never a bespoke table per job kind. `job_schedules` generates recurring `background_jobs` rows per its `cron_expression`, ticked by `node-cron`. Every attempt (including retries) gets its own `job_execution_logs` row.
- Implement the worker (`src/jobs/worker.ts`) as a polling loop using `SELECT ... FOR UPDATE SKIP LOCKED` (via `prisma.$queryRaw` or `prisma.$transaction` with `Prisma.sql`) against `(status='pending', priority DESC, scheduled_at)`, claiming a small batch at a time — this respects `max_retries`/`retry_count`/`last_error` exactly as modeled; don't introduce a parallel retry mechanism (e.g. a separate Redis-queue's own retry state) that the DB rows don't reflect. Redis/BullMQ may sit *in front of* this purely to wake the poller faster than its polling interval — never as an alternative source of truth.
- **ERP/POS integration is schema-only in v1** (schema §19): implement `external_systems`, `external_system_mappings`, `integration_events` fully (CRUD + read APIs, §8.13), but do **not** wire any real outbound call to Odoo/SAP/etc. Any entity becomes integration-ready simply by being a valid `entity_type` in `external_system_mappings` — never add ad-hoc `odooProductId`-style columns to `Product`/`Order`/`Company` models even if asked for "just this one field," per the schema's explicit design rationale.

---

## 15. Centralized File Management

All file references — company documents, order attachments, product media (kept as its own dedicated table per schema §26's documented exception), invoices, logos — flow through `files` (the physical record) + `file_attachments` (the generic polymorphic mapping), **not** through per-entity `*DocumentId` columns or per-entity attachment tables/models. Implement `IFileStorageProvider` (a plain TypeScript interface) with at least a `LocalFileStorageProvider` (dev, writes under `UPLOAD_PATH`) and one cloud provider (prod, S3-compatible), selected purely by `FILE_STORAGE_PROVIDER` — application code never branches on the provider directly, only the factory that constructs the provider does.

---

## 16. Notifications

Channel-agnostic, template-driven: `notification_templates` (per channel, per language) → `notifications` (queued/sent/delivered/failed/read, `recipient_type`+`recipient_id` polymorphic per schema §30.2) → optional `device_tokens` for push (`owner_type`+`owner_id` polymorphic). Implement one sender module per channel (`emailSender.ts`, `smsSender.ts`, `pushSender.ts`, `inAppNotifier.ts`) dispatched by `notifications.channel`, enqueued as a `background_jobs` row (`job_type='send_notification'`) rather than sent synchronously inside the triggering request — a slow SMS provider must never block an order-placement response.

---

## 17. Localization / Multilingual Support

- `languages` is the single source of truth for supported locales (`is_rtl` drives Arabic text direction) — never hardcode `"ar"`/`"en"` as a literal anywhere except seed data.
- High-traffic entities (`products`) keep their dedicated `product_translations` table for query performance; every other user-facing entity (categories, catalog menus, dashboard pages, notification templates, modules/features…) uses the generic polymorphic `translations` table (`entity_type`, `entity_id`, `field_name`, `language_code`). Do not create a new dedicated `*_translations` table for a new entity without a documented performance justification matching the one given for `products`.
- Resolution: given a `language_code`, look up the specific translation row; fall back to `languages.is_default` when missing. Implement as a single `localizationResolver.ts`, not inline fallback logic scattered per controller.

---

## 18. Global Settings & Company Configuration Resolution

Two layers, one resolution contract (schema §27):

```
resolve(companyId, settingKey):
    1. companyConfigurations.findFirst({ where: { company_id: companyId, config_key: settingKey, is_active: true } })
       → found: return it (company override wins)
    2. else globalSettings.findUnique({ where: { setting_key: settingKey } })
       → return the platform default
    3. neither exists → application-level error, never a silent hardcoded default
```
Every write to either table bumps `config_version`/increments and appends to the matching `*_history` table (`company_configuration_history`, `global_settings_history`) — implement this as a Prisma Client Extension `query` hook on `companyConfigurations.update`/`create` and `globalSettings.update` so a developer can never forget the history-append step when adding a new settings-writing endpoint. `global_settings.is_overridable = false` **MUST** be enforced at the service layer on every company-configuration write path (reject with a clear error, don't silently ignore the attempted override).

---

## 19. Security (Server & Application)

- **Security headers** via `helmet` + explicit `Content-Security-Policy`/`X-Content-Type-Options`/`X-Frame-Options` config; `hpp` against HTTP parameter pollution.
- **CORS**: allow-list only, from `CORS_ORIGINS`, distinct origins for the company client and the dashboard client.
- **Rate limiting**: `express-rate-limit` (+ `rate-limit-redis` in prod); stricter policy on `/auth/*` (login, OTP send/verify, password reset) than on general API traffic.
- **Input validation**: Zod on every request DTO; never trust a client-supplied `companyId`/`departmentId` that doesn't match the authenticated principal — re-derive it server-side from `req.actor` wherever possible instead of accepting it as a request parameter.
- **Secrets**: never in `.env` files checked into source control (only `.env.example` with placeholders); use environment variables / a secrets manager in every environment beyond local dev.
- **SQL injection**: Prisma's query builder is parameterized by default; any raw SQL (e.g. the `FOR UPDATE SKIP LOCKED` job claim, or BRIN-indexed time-range reports) **MUST** use `Prisma.sql`/tagged-template `$queryRaw`, never manual string concatenation.
- **Mass assignment**: Zod DTOs are explicit request/response shapes, never the Prisma model type directly bound from the request body.
- **Audience isolation**: re-verify §7.1's two-audience separation with an integration test that asserts a `company`-audience token receives 401/403 on every `/dashboard/*` route and vice versa.
- **File upload**: validate MIME type + extension + size limit via `multer` config before writing to `files`; never trust the client-declared `mimetype` alone — sniff the actual bytes (e.g. `file-type` package) before persisting.
- **Health check**: `GET /api/v1/health` unauthenticated, returns `{"status":"ok"}` (extend with DB connectivity check only behind an internal-only variant, never expose DB status publicly).

---

## 20. Auditing, Logging & Observability

- Every `insert`/`update`/`delete`/`restore` on a business table writes one `audit_logs` row (`old_values`/`new_values`/`changed_fields` as Json, `correlation_id` tying together every row from one logical operation) — implement via a Prisma Client Extension that wraps `create`/`update`/`updateMany`/`delete` on every audited model, diffing before/after (Appendix D), not per-handler manual calls (which will inevitably be forgotten somewhere).
- `timeline_events` is the separate, human-facing "what happened" business narrative (order created → kitchen accepted → delivered), append-only, written explicitly by service code at meaningful business milestones — do **not** try to auto-generate it from the audit extension; the two logs serve different audiences and must not be conflated.
- `integration_events` is a third, distinct outbox-style log for "what an external system might care about" — populate it from the same service code that already writes `timeline_events`, tagged with the same `correlation_id`, but keep it a separate write since its consumer (a future sync worker) is different from either of the other two logs' consumers.
- Structured logging (Pino) enriches every log line with `correlationId`/`requestId` (propagated via `AsyncLocalStorage`, same mechanism as the tenant context, §6.5) matching the audit/integration rows, so a single request's full footprint across all three logs plus the app log is traceable end to end.

---

## 21. API Documentation — Swagger/OpenAPI (Mandatory, Zero Exceptions)

This section exists because "add Swagger later" is exactly how backends end up with undocumented endpoints. **Treat a missing or stale OpenAPI entry for any route as a bug of the same severity as a missing test.**

1. **Single source of truth per route:** every route's request (params/query/body) and response Zod schemas are registered once, via `@asteasolutions/zod-to-openapi`'s `OpenAPIRegistry`, in the same file where the schema is defined (co-located with the module, e.g. `src/modules/orders/orders.schemas.ts`). The Express `validate(schema)` middleware and the OpenAPI doc are generated from the **exact same object** — never hand-maintain a parallel JSDoc/YAML description that can drift from the real validator.
2. **Registration is part of the route's definition-of-done.** When you add `ordersRouter.post('/', validate(createOrderSchema), createOrder)`, the same PR **MUST** add `registry.registerPath({ method: 'post', path: '/company/orders', request: { body: createOrderSchema }, responses: { 200: { ... } }, tags: ['Orders'], security: [{ companyBearerAuth: [] }] })`.
3. **Two documents, one per audience**, generated at boot and served via `swagger-ui-express`:
   - `GET /api/docs/company` — only `/api/v1/company/*` and `/api/v1/auth/*` (company actorType) routes.
   - `GET /api/docs/dashboard` — only `/api/v1/dashboard/*`, `/api/v1/me/*` (dashboard), and `/api/v1/auth/*` (dashboard actorType) routes.
   - Both documents share the same underlying registry, filtered by `tags`/path prefix at generation time — do not maintain two separate registries.
4. **Every response documents both the success envelope and the error envelope** (Appendix B), including the specific `error.code` values a client can expect for that route (e.g. `VALIDATION_ERROR`, `CONFLICT`, `FORBIDDEN`).
5. **Security schemes** (`companyBearerAuth`, `dashboardBearerAuth`) are declared once in the OpenAPI component registry and referenced per-route — this doubles as living documentation of §7.1's audience separation.
6. **CI gate (add this once the test suite exists, §22):** a test that walks every registered Express route (`app._router.stack`) and asserts a matching OpenAPI path+method entry exists — fails the build if any route is undocumented. This is the mechanical enforcement of "no missing Swagger," not just a style guideline.

---

## 22. Testing & Quality

- **Unit tests** (Vitest): every service method, every engine (`businessRuleResolver`, `workflowEngine`, `approvalEngine`, `menuResolver`, `permissionResolver`), with table-driven cases for priority/tie-break resolution (§9, §10, §13, §18).
- **Integration tests** (Vitest + Supertest, real dockerized Postgres — never an in-memory/mock substitute): one file per module; explicitly test the tenant-scoping/soft-delete Prisma extension (§6.5) with a Company User attempting cross-tenant access and a Dashboard User exercising both `scope_type='all'` and `scope_type='specific'`.
- **Contract tests** for the standard response envelope (Appendix B) and error-shape consistency across all routers, plus the OpenAPI-coverage gate from §21.6.
- **Migration tests**: apply every migration against a clean database in CI (`prisma migrate deploy` against a throwaway container) to catch drift between `schema.prisma` and the actual applied schema before merge.
- Target meaningful coverage on services and engines; infrastructure adapters (file storage, notification senders) covered by fakes/mocks, not required to hit real third-party services in CI.

---

## 23. Deployment

- **Containerized path (preferred):** multi-stage `Dockerfile` (build TypeScript → slim runtime image) → `docker-compose.yml` locally (API + Postgres + Redis) → the same image deployed to any container platform (Kubernetes, ECS, or a plain VPS running Docker).
- **VPS path (fallback):** Node process behind Nginx reverse-proxying with SSL termination (Let's Encrypt/Certbot), managed by `pm2` (or a `systemd` unit) keeping the API alive across reboots and restarting on crash.
- **Migrations on deploy:** run `prisma migrate deploy` as an explicit release step, never automatically on application boot in production (avoids two replicas racing to migrate simultaneously).
- **Zero-downtime consideration:** every migration in §6.3 being additive-only (per the schema's own discipline) means rolling deploys never require the old and new code to disagree about a column's existence mid-rollout.
- Run the background job worker (§14) and the cron scheduler as **separate processes** from the HTTP API (e.g. `node dist/jobs/worker.js`, `node dist/jobs/scheduler.js`), each independently restartable — never spawn them as an in-process side effect of the API server starting.

---

## 24. Development Workflow — Phased Execution Protocol

**This section governs *how* you work, not just *what* you build. Read it before writing the first line of code, and follow it for the entire project, not just the first session.**

### 24.1 Why phases/batches/tasks

This backend has ~30 modules and ~95 tables. Attempting it as one continuous, unstructured stream of edits is how scope gets silently dropped, endpoints go undocumented, and half-finished modules get buried under newer work. Instead, work is broken into three nested levels:

- **Phase** — one coherent slice of the system, large enough to be meaningful, small enough to finish and verify before moving on (roughly: one row of the table in §24.2). A phase is "done" when every batch in it is done **and** the app still boots, migrates, lints, and passes tests.
- **Batch** — a deployable-sized group of related work inside a phase (e.g., within the PIM phase: "Batch 5.1 — Categories," "Batch 5.2 — Products + translations + media," "Batch 5.3 — Variants/options/availability/tags," "Batch 5.4 — Pricing lists"). A batch typically corresponds to one `prisma migrate dev` + one or a few routers.
- **Task** — the smallest unit of tracked work inside a batch (e.g., "implement `POST /dashboard/catalog/products`: Zod schema + OpenAPI registration + controller + service + unit test + integration test"). A task is small enough to finish in one focused pass and verify immediately.

### 24.2 The fixed phase order (do not reorder; later phases genuinely depend on earlier ones)

| Phase | Contents | Depends on |
|---|---|---|
| 0 | Project scaffolding: `package.json`, `tsconfig.json`, Express app skeleton, Prisma client singleton + extensions (Appendix D/F), config (§5), logging, error handling, health check, Docker/compose, `.env.example`, base test harness, `IMPLEMENTATION_PROGRESS.md` initialized from §24.2's table | — |
| 1 | Companies & Onboarding (§8.1) + Files module (§15, needed by onboarding documents) | 0 |
| 2 | Company Users + Dashboard Users + RBAC (§2.1, §7, §8.2) — including the two-audience JWT setup | 1 |
| 3 | Feature Management & Dynamic Dashboard (§12) — needed before most other modules can gate themselves | 2 |
| 4 | PIM + Menu Assignment (§8.3, §8.4, §13) | 3 |
| 5 | Business Rules Engine + Calendars (§9) | 3 |
| 6 | Company Configuration + Global Settings (§18) | 3 |
| 7 | Workflow Engine (§10) | 3 |
| 8 | Orders module (§8.7) | 4, 5, 6, 7 |
| 9 | Approval Workflow Engine (§11) | 8 |
| 10 | Tracking Timeline + Audit Logs (§20) | 8 |
| 11 | Notifications (§16) | 2, 8 |
| 12 | Background Jobs + Integration Engine scaffolding (§14) | 8, 11 |
| 13 | Localization (§17) | 4 |
| 14 | API documentation completeness pass (§21.6 CI gate) + Testing hardening + Security pass (§19) + Deployment prep (§23) | all previous |

### 24.3 The tracker file: `IMPLEMENTATION_PROGRESS.md`

A file at `cloudkitchen/backend/IMPLEMENTATION_PROGRESS.md` mirrors §24.2, broken further into batches and tasks, as a checklist. **This file is the single source of truth for "what's done" — not memory, not the chat transcript.**

- Before starting any work in a phase, if that phase's batches/tasks aren't yet broken down in the tracker, break it down first (write the batch/task checklist for that phase into the file) — do this one phase at a time, not all 14 phases up front, since later phases' exact tasks depend on decisions made in earlier ones.
- **Immediately after finishing each task** (code written, self-reviewed, lints clean, relevant tests passing): check it off in `IMPLEMENTATION_PROGRESS.md` in the same turn/commit, with a one-line note if anything deviated from the plan. Do not batch up multiple finished tasks and update the tracker "later" — later never comes reliably.
- A phase is only marked complete in the tracker after: `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test` all pass, and every endpoint added in that phase has a corresponding OpenAPI entry (§21).
- If you discover missing scope mid-phase (a table/endpoint the master prompt or schema implies but doesn't spell out), add it as a new task under the current batch **before** implementing it, so the tracker never lags reality.

### 24.4 Task-level definition of done (applies to every task, no exceptions)

1. Zod request/response schemas defined and reused for both validation and OpenAPI (§21).
2. Route wired with the correct audience auth middleware + authorization check (§7, §4.2).
3. Service method contains the actual logic; controller stays a thin adapter.
4. Soft-delete/tenant-scoping extension relied upon, never bypassed with a raw `prisma.$queryRaw` unless there's a documented reason (index in a comment).
5. Audit/timeline/integration-event writes added wherever §20 calls for them.
6. OpenAPI path registered (§21.2).
7. Unit test for any new service/engine logic; integration test for any new endpoint.
8. `IMPLEMENTATION_PROGRESS.md` checkbox updated.

### 24.5 Automatic enforcement via Cursor rules

The discipline in §24.1–§24.4, plus the working-folder scope constraint stated at the top of this document, is additionally encoded as Cursor project rules under `cloudkitchen/.cursor/rules/` so it applies automatically in every session, not just when this document happens to be in context:

- `00-scope-and-source-of-truth.mdc` — hard-scopes all edits to `/root/cloudkitchen`, names the three source-of-truth documents and their precedence order, and states the DishFlow read-only reference rule (§4.0).
- `01-phased-execution-workflow.mdc` — encodes §24.1–§24.4 verbatim as an always-applied rule: break work into phases/batches/tasks, update `IMPLEMENTATION_PROGRESS.md` after every task, never mark a phase done without the full verification pass.
- `02-nodejs-backend-conventions.mdc` — encodes the module layering, error handling, response envelope, validation, and Prisma-extension conventions from §3/§4/§6/§20/§21, scoped to `backend/**/*.ts`.

If you are the agent reading this and these rule files don't exist yet in `cloudkitchen/.cursor/rules/`, creating them is part of **Phase 0** — do not skip it.

---

## 25. Pre-Launch Checklist

```
[ ] Both JWT audiences use distinct, sufficiently random secrets; cross-audience token rejection covered by an integration test
[ ] Tenant-scoping + soft-delete Prisma extensions (§6.5) verified against a real cross-tenant access attempt
[ ] Every append-only table (§2.2.8) confirmed to have no application code path calling .update()/.delete() against it, and a DB trigger rejecting UPDATE/DELETE as defense in depth
[ ] Business Rules Engine resolution order documented and unit-tested for every seeded rule_type
[ ] Workflow Engine: illegal transition attempts rejected, not silently ignored
[ ] Module-off-always-wins behavior (§12) covered by a test where a feature is enabled but its parent module is disabled
[ ] company_users has zero role/permission relationship anywhere in the codebase — grep confirms it
[ ] Audit extension confirmed firing on insert/update/delete/restore for a representative sample of entities
[ ] Rate limiting active on all /auth/* endpoints
[ ] Health check endpoint live, unauthenticated, returns 200
[ ] All required environment variables validated at startup; app fails fast on a missing required var
[ ] Sentry (if configured) receiving a deliberately-triggered test exception
[ ] File upload MIME/size validation covered by a test with a spoofed extension
[ ] Every registered Express route has a matching OpenAPI entry (§21.6 CI gate is green)
[ ] Seed data present per Appendix G (default roles, permission groups, rule_types, workflow templates, languages, external_systems placeholder rows)
[ ] IMPLEMENTATION_PROGRESS.md shows every phase in §24.2 checked off, with all 8 definition-of-done items (§24.4) satisfied for the last task in each phase
```

---

## Appendix A — Environment Variables (.env)

```dotenv
# ── App ──────────────────────────────────────────
NODE_ENV=development
PORT=3000

# ── Database ─────────────────────────────────────
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/cloudkitchen   # [REQUIRED]

# ── JWT (two audiences, four secrets) ────────────
JWT_COMPANY_ACCESS_SECRET=REPLACE_WITH_64_BYTE_RANDOM       # [REQUIRED]
JWT_COMPANY_REFRESH_SECRET=REPLACE_WITH_DIFFERENT_64_BYTE   # [REQUIRED]
JWT_DASHBOARD_ACCESS_SECRET=REPLACE_WITH_DIFFERENT_64_BYTE  # [REQUIRED]
JWT_DASHBOARD_REFRESH_SECRET=REPLACE_WITH_DIFFERENT_64_BYTE # [REQUIRED]
JWT_ACCESS_EXPIRES_IN=15m                                   # [REQUIRED]
JWT_REFRESH_EXPIRES_IN=14d                                  # [REQUIRED]

# ── CORS ─────────────────────────────────────────
CORS_ORIGINS=https://company.cloudkitchen.example,https://dashboard.cloudkitchen.example   # [REQUIRED]

# ── OTP ──────────────────────────────────────────
OTP_PROVIDER=mock                                 # [REQUIRED] mock | twilio | <regional-provider>
OTP_PEPPER=REPLACE_WITH_32_BYTE_RANDOM            # [REQUIRED]
TWILIO_ACCOUNT_SID=                               # [OPTIONAL]
TWILIO_AUTH_TOKEN=                                # [OPTIONAL]
TWILIO_FROM_NUMBER=                               # [OPTIONAL]

# ── File Storage ─────────────────────────────────
FILE_STORAGE_PROVIDER=local                       # [REQUIRED] local | s3 | azure_blob
FILE_STORAGE_S3_BUCKET=                           # [OPTIONAL]
FILE_STORAGE_S3_REGION=                           # [OPTIONAL]
FILE_STORAGE_S3_ACCESS_KEY_ID=                    # [OPTIONAL]
FILE_STORAGE_S3_SECRET_ACCESS_KEY=                # [OPTIONAL]
UPLOAD_PATH=./uploads                             # [OPTIONAL] used when FILE_STORAGE_PROVIDER=local

# ── Redis ────────────────────────────────────────
REDIS_ENABLED=false                               # [REQUIRED]
REDIS_URL=redis://localhost:6379                  # [OPTIONAL] required if REDIS_ENABLED=true

# ── Notifications ────────────────────────────────
NOTIFICATIONS_EMAIL_ENABLED=false                 # [REQUIRED]
NOTIFICATIONS_EMAIL_PROVIDER=smtp                 # [OPTIONAL] smtp | resend | sendgrid
NOTIFICATIONS_EMAIL_FROM=noreply@cloudkitchen.example   # [OPTIONAL]
NOTIFICATIONS_SMS_ENABLED=false                   # [REQUIRED]
NOTIFICATIONS_PUSH_ENABLED=false                  # [REQUIRED]

# ── Error Tracking ───────────────────────────────
SENTRY_DSN=                                       # [OPTIONAL] leave empty to disable
LOG_LEVEL=info                                    # [REQUIRED]

# ── Integrations (inert placeholders, schema-only) ──
INTEGRATIONS_DEFAULT_EXTERNAL_SYSTEM=odoo         # [OPTIONAL] seed value only, no live connection in v1

# ── Business Defaults ────────────────────────────
BUSINESS_DEFAULT_CURRENCY=SAR                     # [REQUIRED]
BUSINESS_DEFAULT_TIMEZONE=Asia/Riyadh             # [REQUIRED]
BUSINESS_DEFAULT_LANGUAGE=en                      # [REQUIRED]
```

---

## Appendix B — Standard API Response Envelope

```json
{
  "success": true,
  "data": { },
  "meta": {
    "correlationId": "b3f1...",
    "pagination": { "page": 1, "pageSize": 20, "totalItems": 134 }
  }
}
```
On failure:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "quantity must be greater than or equal to the product's minimum order quantity",
    "details": [ { "field": "quantity", "issue": "min_order_qty" } ]
  },
  "meta": { "correlationId": "b3f1..." }
}
```
Implement via a single `sendSuccess(res, data, meta?)` / `sendError` helper plus the central `errorHandler`, so no controller hand-rolls this shape (mirrors the reference project's `contracts/envelope.ts` + `core/errors/errorHandler.ts`, extended with `meta.correlationId` on every response, not just errors).

---

## Appendix C — Business Rule Resolution Algorithm (Reference Pseudocode)

```typescript
type ScopeType = 'platform' | 'company' | 'department' | 'user' | 'product' | 'category';

const SCOPE_SPECIFICITY: Record<ScopeType, number> = {
  user: 4,
  product: 4,
  department: 3,
  category: 3,
  company: 2,
  platform: 1,
};

export async function resolveBusinessRule(
  prisma: PrismaClient,
  params: {
    ruleTypeCode: string;
    companyId: string;
    departmentId?: string;
    userId?: string;
    productId?: string;
    categoryId?: string;
    atInstant: Date;
  },
): Promise<unknown | null> {
  const candidates = await prisma.businessRule.findMany({
    where: {
      rule_type: { code: params.ruleTypeCode },
      effective_from: { lte: params.atInstant },
      OR: [{ effective_to: null }, { effective_to: { gt: params.atInstant } }],
      AND: [
        {
          OR: [
            { scope_type: 'platform' },
            { scope_type: 'company', scope_id: params.companyId },
            { scope_type: 'department', scope_id: params.departmentId ?? undefined },
            { scope_type: 'user', scope_id: params.userId ?? undefined },
            { scope_type: 'product', scope_id: params.productId ?? undefined },
            { scope_type: 'category', scope_id: params.categoryId ?? undefined },
          ],
        },
      ],
    },
  });

  const winner = candidates.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return SCOPE_SPECIFICITY[b.scope_type as ScopeType] - SCOPE_SPECIFICITY[a.scope_type as ScopeType];
  })[0];

  return winner?.value ?? null;
}
```

---

## Appendix D — Sample Prisma Model Usage & Auditable Convention

`prisma/schema.prisma` already models the Auditable field block on every mutable business entity (§2.2.3, schema §30.1). The `created_by_type`/`created_by_id`/`updated_by_type`/`updated_by_id` pair is **polymorphic on purpose** — there is no single `users` table to point a real FK at. Populate it from the request's `AsyncLocalStorage`-scoped actor context, never left null on a write that has an authenticated actor:

```typescript
// src/prisma/client.ts (excerpt)
import { PrismaClient } from '@prisma/client';
import { getRequestActor } from '../core/middleware/requestContext';

export const prisma = new PrismaClient().$extends({
  query: {
    $allModels: {
      async create({ args, query, model }) {
        const actor = getRequestActor();
        if (actor && AUDITABLE_MODELS.has(model)) {
          args.data = { ...args.data, created_by_type: actor.type, created_by_id: actor.id };
        }
        return query(args);
      },
      async update({ args, query, model }) {
        const actor = getRequestActor();
        if (actor && AUDITABLE_MODELS.has(model)) {
          args.data = { ...args.data, updated_by_type: actor.type, updated_by_id: actor.id };
        }
        return query(args);
      },
    },
  },
});
```
Optimistic concurrency (`version`) is enforced explicitly at the service layer, not the extension, because the caller needs to react to a 0-row update as a 409:

```typescript
const result = await prisma.order.updateMany({
  where: { id: orderId, version: expectedVersion },
  data: { ...changes, version: { increment: 1 } },
});
if (result.count === 0) throw new ConflictError('Order was modified by someone else — reload and retry.');
```

---

## Appendix E — Sample Authorization Middleware (Dashboard RBAC)

```typescript
// src/core/middleware/requirePagePermission.ts
import { RequestHandler } from 'express';
import { permissionResolver } from '../../engines/permissionResolver';
import { ForbiddenError } from '../errors/AppError';

type PageAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'reject' | 'export' | 'import';

export function requirePagePermission(pageCode: string, action: PageAction): RequestHandler {
  return async (req, res, next) => {
    if (req.actor?.type !== 'dashboard_user') return next(new ForbiddenError('Wrong audience'));
    const allowed = await permissionResolver.canAsync(req.actor.id, pageCode, action);
    if (!allowed) return next(new ForbiddenError(`Missing '${action}' on '${pageCode}'`));
    next();
  };
}

// usage in a router:
// router.post('/dashboard/companies/:id/approve', dashboardAuthMiddleware, requirePagePermission('companies', 'approve'), approveCompanyController);
```

---

## Appendix F — Tenant Scoping & Soft Delete (Prisma Client Extensions)

```typescript
// src/core/middleware/requestContext.ts
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestActor {
  type: 'company_user' | 'dashboard_user';
  id: string;
  companyId?: string; // present only for company_user
}

const storage = new AsyncLocalStorage<{ actor?: RequestActor; correlationId: string }>();
export const requestContextMiddleware: RequestHandler = (req, res, next) => {
  storage.run({ correlationId: req.headers['x-correlation-id']?.toString() ?? crypto.randomUUID() }, next);
};
export function setRequestActor(actor: RequestActor) {
  const ctx = storage.getStore();
  if (ctx) ctx.actor = actor;
}
export function getRequestActor(): RequestActor | undefined {
  return storage.getStore()?.actor;
}
export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
```
```typescript
// src/prisma/client.ts (soft-delete + tenant scoping extension, excerpt)
const SOFT_DELETE_MODELS = new Set(['Company', 'Order', 'Product' /* ...every model with is_deleted */]);
const TENANT_SCOPED_MODELS = new Set(['Order', 'Department', 'CompanyConfiguration' /* ...every model with company_id */]);

export const prisma = basePrismaClient.$extends({
  query: {
    $allModels: {
      async findMany({ args, query, model }) {
        args.where = applyScoping(model, args.where);
        return query(args);
      },
      async findFirst({ args, query, model }) {
        args.where = applyScoping(model, args.where);
        return query(args);
      },
      async count({ args, query, model }) {
        args.where = applyScoping(model, args.where);
        return query(args);
      },
    },
  },
});

function applyScoping(model: string, where: any) {
  const actor = getRequestActor();
  const clauses = [where];
  if (SOFT_DELETE_MODELS.has(model) && !where?.includeDeleted) {
    clauses.push({ is_deleted: false });
  }
  if (TENANT_SCOPED_MODELS.has(model) && actor?.type === 'company_user') {
    clauses.push({ company_id: actor.companyId });
  }
  return { AND: clauses };
}
```
`dashboard_user_company_scope`/`dashboard_user_company_assignments` resolution (schema §29) is **not** folded into this generic extension — it's applied explicitly wherever a dashboard "list companies"-shaped query happens, since it's a genuine data-scoping join, not a blanket allow/deny rule.

---

## Appendix G — Seed Data Checklist

```
[ ] languages: en (default), ar (is_rtl=true)
[ ] roles: Super Admin, Sales, Operations, Kitchen Manager, Support, Finance, Marketing, Engineering (all scope=platform, is_system_role=true)
[ ] permission_groups + permissions: Orders, Products, Categories, Reports, Companies, Rules, Features, Dashboard Users (CRUD + relevant cross-cutting codes)
[ ] dashboard_pages + role_page_permissions: default page tree with Super Admin granted full access
[ ] modules + features: Orders, Products, Categories, Reports, Notifications, Tracking, Analytics, Bulk Orders, Export Excel, Import Excel (module.audience set per §12)
[ ] rule_types: min_order_qty, max_order_qty, min_notice_hours, allowed_delivery_days, cutoff_time, blackout_dates, vat_rate, service_charge, delivery_fee
[ ] workflows + workflow_steps + workflow_transitions: default Order workflow (submitted → pending_approval → kitchen_accepted → preparing → ready → delivered, plus cancelled/refunded)
[ ] approval_workflows: default Company Registration Approval, default Order Approval (High Value / Standard)
[ ] external_systems: placeholder row(s) e.g. odoo, is_active=false
[ ] global_settings: theme.primary_color, ordering.default_vat_rate, notification.order_confirmation.channel
[ ] Postgres enums created: company_status, approval_status, document_verification_status, fulfillment_type (via `prisma migrate dev` against the already-modeled `prisma/schema.prisma` enums)
```

---

*End of Backend Master Prompt. All sections above are mandatory unless explicitly marked optional. Where this document, `cloud-kitchen-b2b-schema.md`, and `prisma/schema.prisma` appear to conflict: `prisma/schema.prisma` wins on "what column/table exists," `cloud-kitchen-b2b-schema.md` wins on "why it's shaped this way," and this document wins on implementation/process questions. See `IMPLEMENTATION_PROGRESS.md` for current status.*
