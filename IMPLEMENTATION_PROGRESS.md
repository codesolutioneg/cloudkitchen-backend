# Cloud Kitchen B2B Backend — Implementation Progress Tracker

> Governed by `CLOUD_KITCHEN_B2B_BACKEND_MASTER_PROMPT.md` §24 (Phased Execution Protocol). This file is the single source of truth for "what's done" — update it immediately after finishing each task, in the same turn/commit as the code, per §24.3/§24.4. Do not batch updates.
>
> Legend: `[ ]` not started · `[~]` in progress · `[x]` done (all 8 items in §24.4's definition-of-done satisfied) · `[!]` blocked (leave a one-line note why)

---

## How to use this file

1. Work phases **in order** (§24.2 — later phases depend on earlier ones).
2. Before starting a phase, if its batches/tasks aren't broken down yet, break them down here first (add `### Batch N.x` / task checkboxes under that phase) — one phase at a time, not all of them up front.
3. Check off each task the moment it's done (code + lints + relevant tests passing + OpenAPI registered + tracker updated — §24.4).
4. A phase's own checkbox at the top only gets `[x]` once **every** batch/task under it is `[x]` **and** `npm run typecheck && npm run lint && npm run build && npm test` all pass **and** every endpoint added in the phase has an OpenAPI entry.
5. If you discover missing scope mid-phase, add a new task under the relevant batch before implementing it — never implement first and document later.

---

## Phase Overview

| # | Phase | Status |
|---|---|---|
| 0 | Project scaffolding | [x] |
| 1 | Companies & Onboarding + Files | [x] |
| 2 | Company Users + Dashboard Users + RBAC | [x] |
| 3 | Feature Management & Dynamic Dashboard | [x] |
| 4 | PIM + Menu Assignment | [x] |
| 5 | Business Rules Engine + Calendars | [x] |
| 6 | Company Configuration + Global Settings | [x] |
| 7 | Workflow Engine | [x] |
| 8 | Orders module | [x] |
| 9 | Approval Workflow Engine | [x] |
| 10 | Tracking Timeline + Audit Logs | [x] |
| 11 | Notifications | [x] |
| 12 | Background Jobs + Integration Engine scaffolding | [x] |
| 13 | Localization | [x] |
| 14 | API doc completeness + Testing hardening + Security pass + Deployment prep | [ ] |

---

## Phase 0 — Project Scaffolding

### Batch 0.1 — Repo & tooling
- [x] `package.json` with the exact dependency set from master prompt §3
- [x] `tsconfig.json` (`strict: true`, `noUncheckedIndexedAccess: true`)
- [x] ESLint + Prettier config
- [x] `.env.example` per Appendix A
- [x] `cloudkitchen/.cursor/rules/*.mdc` created (§24.5) — do this before any other Phase 0 task

### Batch 0.2 — Express + config skeleton
- [x] `src/config/index.ts` — Zod env schema, fail-fast on boot
- [x] `src/app.ts` — Express app assembly (helmet, hpp, cors, pino-http, requestContextMiddleware)
- [x] `src/server.ts` — listen + graceful shutdown
- [x] `src/core/errors/` — `AppError` hierarchy, `errorCodes.ts`, central `errorHandler`
- [x] `src/core/utils/response.ts` — envelope helpers (Appendix B)
- [x] `GET /api/v1/health` unauthenticated endpoint

### Batch 0.3 — Prisma wiring
- [x] `prisma/schema.prisma` already present — run `prisma generate`, confirm it compiles
- [x] First `prisma migrate dev --name init` against a local Postgres
- [x] `src/prisma/client.ts` — singleton client + soft-delete/tenant-scoping extension (Appendix F) + actor-stamping (Appendix D excerpt; full audit-diff extension deferred to Phase 10)
- [x] `src/core/middleware/requestContext.ts` — AsyncLocalStorage actor/correlation context

### Batch 0.4 — Docs & docker
- [x] `src/core/openapi/` — zod-to-openapi registry + `/api/docs/company`, `/api/docs/dashboard` wiring
- [x] `Dockerfile` (multi-stage) + `docker-compose.yml` (api + postgres + redis)
- [x] `README.md` — how to run locally

### Batch 0.5 — Test harness
- [x] Vitest config, one smoke unit test, one smoke integration test (health check)
- [x] Full verification pass: `typecheck`, `lint`, `build`, `test`, `prisma validate` — all green

---

## Phase 1 — Companies & Onboarding + Files

### Batch 1.1 — Files module core
- [x] `IFileStorageProvider` + `LocalFileStorageProvider` + `fileStorageFactory`
- [x] `upload` middleware (multer + MIME allow-list + `file-type` byte sniffing)
- [x] `POST /api/v1/files`, `GET /api/v1/files/:id`, `DELETE /api/v1/files/attachments/:attachmentId`
- [x] OpenAPI registration + integration test

### Batch 1.2 — Company registration
- [x] `POST /api/v1/company/onboarding/register` (company + primary `company_users` row, `status=pending`)
- [x] `GET /company/profile` deferred to Phase 2 (requires JWT)
- [x] OpenAPI registration + integration tests

### Batch 1.3 — Company addresses
- [x] `GET/POST/PATCH/DELETE /api/v1/company/onboarding/addresses`
- [x] Partial-unique migration (`one default per address_type`)
- [x] 409 on duplicate default + integration tests

### Batch 1.4 — Onboarding documents
- [x] `POST /api/v1/company/onboarding/documents` (multipart wrapper over files module, `entity_type=company`)
- [x] `PATCH /api/v1/dashboard/companies/:id/documents/:attachmentId/verify` (sets `verification_status`, `verified_by`, `verified_at`)
- [x] OpenAPI registration + integration tests

### Batch 1.5 — Dashboard company review
- [x] `GET /api/v1/dashboard/companies?approvalStatus=` (paginated list)
- [x] `POST /api/v1/dashboard/companies/:id/approve` and `/reject` (append-only `company_approval_history`)
- [x] Dashboard auth stub via `x-test-dashboard-user-id` header (real JWT in Phase 2)
- [x] OpenAPI registration + integration tests

---

## Phase 2 — Company Users + Dashboard Users + RBAC

### Batch 2.1 — Company auth
- [x] `src/core/utils/jwt.ts`, `otp.ts`, `hash.ts` — dual-audience JWT + OTP hashing
- [x] `POST /api/v1/auth/company/login`, `/otp/send`, `/otp/verify`, `/refresh`, `/logout`
- [x] `GET /api/v1/company/profile` — own company only (403 pattern)
- [x] Refresh token rotation (`replaced_by_token_id`), login history writes
- [x] OpenAPI + integration tests (`tests/integration/auth.test.ts`)

### Batch 2.2 — Dashboard auth
- [x] `POST /api/v1/auth/dashboard/login`, `/otp/send`, `/otp/verify`, `/refresh`, `/logout`, `GET /me`
- [x] `companyAuthMiddleware` / `dashboardAuthMiddleware` verify Bearer JWT (test headers still work in VITEST)
- [x] Cross-audience rejection integration tests (§7.1)

### Batch 2.3 — RBAC core + seed
- [x] `src/engines/permissionResolver.ts`, `requirePagePermission` middleware
- [x] `prisma/seed.ts` — roles, permission groups, modules, features, dashboard pages, Super Admin
- [x] `GET/POST/PATCH /api/v1/dashboard/roles`, `PUT .../permissions`, `PUT .../page-permissions`

### Batch 2.4 — Dashboard user management
- [x] `POST /api/v1/dashboard/users` (invite), `POST .../roles`, `GET /dashboard/companies/:id/users`

### Batch 2.5 — Permission resolver + company scoping
- [x] `src/engines/companyScopeResolver.ts` — applied to `listCompanies`
- [x] `PUT /api/v1/dashboard/users/:id/company-scope`

---

## Phase 3 — Feature Management & Dynamic Dashboard

### Batch 3.1 — Fine-grained features
- [x] `GET/POST/PATCH /api/v1/dashboard/features`, `/feature-groups`, `/company-features`, `/feature-flags`

### Batch 3.2 — Coarse modules
- [x] `src/engines/moduleFeatureResolver.ts` — module-off-always-wins + unit test
- [x] `GET/POST/PATCH /api/v1/dashboard/modules`, `/company-modules`, `/dashboard-role-modules`, `/dashboard-role-features`

### Batch 3.3 — Dashboard pages & page permissions
- [x] `GET/POST/PATCH /api/v1/dashboard/pages` (seeded default page tree + Super Admin full access)

### Batch 3.4 — Aggregate endpoints
- [x] `GET /api/v1/me/modules` (company), `GET /api/v1/me/navigation` (dashboard tree)

---

## Phase 4 — PIM + Menu Assignment

### Batch 4.1 — Categories
- [x] `GET/POST/PATCH/DELETE /api/v1/dashboard/catalog/categories`

### Batch 4.2 — Products core
- [x] `GET/POST/PATCH/DELETE /api/v1/dashboard/catalog/products`, `PUT .../translations/:lang`

### Batch 4.3 — Variants & options
- [x] Variants, option-groups, options, availability, tags endpoints

### Batch 4.4 — Tiered pricing
- [x] Pricing lists, prices, company-assignment endpoints

### Batch 4.5 — Catalog menus
- [x] `GET/POST/PATCH/DELETE /api/v1/dashboard/menus`, sections, section products

### Batch 4.6 — Menu assignment & resolution
- [x] `src/engines/menuResolver.ts`, `POST .../assignments`, `GET /api/v1/company/catalog/menu`
- [x] Integration tests (`tests/integration/catalog.test.ts`)

---

## Phase 5 — Business Rules Engine + Calendars

### Batch 5.1 — Rule types & business rules CRUD
- [x] `src/engines/businessRuleResolver.ts` (Appendix C algorithm + cache)
- [x] Dashboard rule-types + business-rules endpoints under `/api/v1/dashboard/rules/...`
- [x] `GET /api/v1/dashboard/rules/business-rules/resolve` query endpoint
- [x] Seed: Appendix G rule types (`min_order_qty`, `max_order_qty`, etc.)

### Batch 5.2 — Calendars & events
- [x] Calendars CRUD + calendar events (blackout/holiday) endpoints
- [x] Page permission `/dashboard/rules` seeded for Super Admin

### Batch 5.3 — Tests
- [x] Unit test `tests/unit/businessRuleResolver.test.ts`
- [x] Integration tests in `tests/integration/phases-5-7.test.ts`

---

## Phase 6 — Company Configuration + Global Settings

### Batch 6.1 — Config resolver engine
- [x] `src/engines/configResolver.ts` — resolve, merge, `assertOverridable`

### Batch 6.2 — Settings endpoints
- [x] `GET/PUT /api/v1/company/settings`
- [x] `GET/PUT /api/v1/dashboard/settings/global`
- [x] `GET/PUT /api/v1/dashboard/settings/company/:companyId`
- [x] Settings history append on company override

### Batch 6.3 — Seed & tests
- [x] Global settings seed (`theme.primary_color`, `ordering.default_vat_rate`, `notification.order_confirmation.channel`)
- [x] Integration tests: company read + non-overridable rejection (403)

---

## Phase 7 — Workflow Engine

### Batch 7.1 — Workflow engine core
- [x] `src/engines/workflowEngine.ts` — `createInstance`, `transition`, `computeSlaDueAt`, `resolveWorkflowForEntity`
- [x] `src/engines/workflowActionDispatcher.ts` — notify/webhook/escalate → `background_jobs` (`require_approval` stub for Phase 9)

### Batch 7.2 — Workflow CRUD & instances
- [x] Dashboard workflow templates, steps, transitions, conditions, step actions
- [x] `GET/POST /api/v1/dashboard/workflow-instances`, `POST .../:id/transition`
- [x] Seed: default order workflow with steps/transitions
- [x] Page permission `/dashboard/workflows` seeded for Super Admin

### Batch 7.3 — Tests
- [x] Integration tests: list workflow, create instance, manual transition

---

## Phase 8 — Orders Module

### Batch 8.1 — Order placement & validation
- [x] `src/modules/orders/` — create, list, detail, cancel, notes, lightweight approvals
- [x] Menu validation + `menuResolver` pricing snapshots + `businessRuleResolver` + VAT from `configResolver`
- [x] Transactional workflow instance + `OrderStatusHistory` + `timeline_events`

### Batch 8.2 — Dashboard order operations
- [x] `GET/POST /api/v1/dashboard/orders/*` — list, detail, transitions, notes, approvals
- [x] Page `/dashboard/orders` seeded for Super Admin

### Batch 8.3 — Seed & tests
- [x] Seed: Chicken Meal catalog, platform menu, min_order_qty rule
- [x] Integration tests `tests/integration/phases-8-10.test.ts`
- [x] Fix: global workflow templates visible to company users (`Workflow` tenant scoping)

---

## Phase 9 — Approval Workflow Engine

### Batch 9.1 — Approval engine
- [x] `src/engines/approvalEngine.ts` — createRequest, decide, canUserDecide, sequential + quorum
- [x] Wired `require_approval` in `workflowActionDispatcher`

### Batch 9.2 — Approval workflows module
- [x] CRUD `/api/v1/dashboard/approval-workflows` + steps
- [x] `/api/v1/dashboard/approval-requests` list/get/decide
- [x] Seed: default order approval workflow (Super Admin role step)
- [x] Page `/dashboard/approval-workflows` seeded

### Batch 9.3 — Tests
- [x] Integration tests in `phases-8-10.test.ts`

---

## Phase 10 — Tracking Timeline + Audit Logs

### Batch 10.1 — Timeline
- [x] `src/engines/timelineService.ts`
- [x] `GET /api/v1/company/orders/:id/tracking`

### Batch 10.2 — Audit extension
- [x] Prisma audit extension on create/update → `audit_logs` with `correlation_id`
- [x] `GET /api/v1/dashboard/audit-logs` with filters
- [x] Page `/dashboard/audit-logs` seeded

### Batch 10.3 — Tests
- [x] Timeline + audit log integration tests
- [x] OpenAPI route coverage: **103 operations** (`tests/integration/openapi-routes.test.ts`)

---

## Phase 11 — Notifications

### Batch 11.1 — Core senders + engine
- [x] `src/core/notifications/firebaseApp.ts`, `pushSender.ts`, `emailSender.ts`, `inAppNotifier.ts`
- [x] `src/engines/notificationEngine.ts` — queueNotification + send_notification job enqueue

### Batch 11.2 — API module
- [x] Company: notifications list/read, device-tokens register/delete
- [x] Dashboard: notification-templates CRUD
- [x] OpenAPI registerPath for all endpoints

### Batch 11.3 — Seed & wiring
- [x] Seed: `order_confirmation` templates (push + in_app, en + ar), `/dashboard/notifications` page
- [x] `workflowActionDispatcher` notify → `notificationEngine.queueNotification`
- [x] Integration tests in `tests/integration/phases-11-13.test.ts`

---

## Phase 12 — Background Jobs + Integration Engine Scaffolding

### Batch 12.1 — Job infrastructure
- [x] `src/jobs/jobQueue.ts`, `worker.ts`, `scheduler.ts`, `handlers/sendNotification.ts`
- [x] Worker processes: send_notification, workflow.notify/webhook/escalate

### Batch 12.2 — Jobs + Integrations modules
- [x] Dashboard jobs list/detail/retry/cancel + `/dashboard/jobs` page
- [x] Dashboard integrations systems CRUD, mappings, events + `/dashboard/integrations` page
- [x] Seed: default `odoo` external system (inactive)
- [x] `workflowActionDispatcher` webhook/escalate → `jobQueue.enqueueJob`

---

## Phase 13 — Localization

### Batch 13.1 — Resolver + module
- [x] `src/engines/localizationResolver.ts` — resolveTranslation, listTranslations, default fallback
- [x] Dashboard languages CRUD, translations list/upsert; company active languages
- [x] Page `/dashboard/localization` seeded

### Batch 13.2 — Catalog wiring & tests
- [x] `getProduct` uses localizationResolver when `lang` query or Accept-Language provided
- [x] Integration tests: category translation upsert + resolve, product lang query

---

## Phase 14 — API Doc Completeness + Testing Hardening + Security Pass + Deployment Prep

### Batch 14.1 — OpenAPI CI gate
- [x] `src/core/openapi/bootstrap.ts` + `registerMissingPaths.ts` — supplemental path registrations
- [x] Fixed `me.schemas.ts` recursive `z.lazy` navigation tree (broke Swagger generation when imported)
- [x] `tests/helpers/expressRoutes.ts` — discover all Express routes from `*.routes.ts`
- [x] `tests/integration/openapi-coverage-gate.test.ts` — fails if any route lacks OpenAPI entry

### Batch 14.2 — Full lifecycle E2E (faker, persisted data)
- [x] `@faker-js/faker` devDependency + `tests/helpers/dataGenerator.ts`
- [x] `tests/integration/full-lifecycle-e2e.test.ts` — register → approve → catalog → menu → order → rules → notifications → jobs → integrations → localization → audit → files → OpenAPI sweep
- [x] Manifest written to `tests/output/e2e-manifest-{runId}.json` (no DB cleanup)
- [x] `tests/output/README.md` — how to inspect persisted test data

### Batch 14.3 — Security hardening
- [x] `tests/integration/security-hardening.test.ts` — cross-audience JWT, tenant isolation, illegal transition, envelope contract
- [x] `requireAnyAuthMiddleware` resolves Bearer JWT (files upload works with real tokens)

### Batch 14.4 — Verification
- [x] `npm run typecheck && npm run lint && npm test && npm run build` — **266 tests passing**

---

## Phase 15 — Fulfillment (Delivery + Pickup)

### Batch 15.1 — Schema + workflow steps
- [x] Migration `20260707120000_phase15_fulfillment` — `orders.fulfillment_qr_token`, delivery assignment columns on `order_delivery_details`
- [x] Workflow steps: `out_for_delivery`, `awaiting_pickup`, `picked_up` + transitions in seed
- [x] Order create generates QR token + `order_delivery_details` row for delivery orders

### Batch 15.2 — Fulfillment module
- [x] `src/modules/fulfillment/` — assign, depart, QR confirm, pickup transitions, delivery user list
- [x] Kitchen **or** Operations can assign; one active delivery order per driver
- [x] Company `GET /company/orders/{id}/fulfillment-qr` (QR not exposed on delivery APIs)
- [x] Delivery address returned with lat/long, label, city, state, lines, contact

### Batch 15.3 — Roles, pages, seed user
- [x] Roles/pages: `/dashboard/kitchen`, `/dashboard/operations`, `/dashboard/delivery`
- [x] Role `Delivery` + seeded user `delivery@cloudkitchen.example` / `Delivery@12345`
- [x] Kitchen Manager + Operations page permissions for assign/pickup

### Batch 15.4 — Unified Swagger + tests
- [x] Single Swagger at `/api/docs` with audience notice; `/api/docs/company` + `/dashboard` redirect
- [x] `tests/integration/phase-15-fulfillment.test.ts` — delivery QR flow, busy-driver guard, pickup flow
- [x] **277 tests passing**

---

## Deviation Log

- **Phase 0 / Batch 0.3:** Full `audit_logs` diff-based Prisma extension intentionally deferred to Phase 10 per master prompt §24.2 dependency order and plan. Phase 0 ships soft-delete, tenant-scoping, and actor-stamping only.
- **Phase 0 / Batch 0.3:** Local Postgres runs on host port **5435** (not 5432) because 5432/5433 were already bound on this machine. `docker-compose.yml` and `.env` updated accordingly.
- **Phase 1 / Batch 1.2:** `languages` seed (`en`, `ar`) required before company registration due to `companies.default_language_code` FK — added to `prisma/seed.ts` and test `globalSetup`.
- **Phase 1 / Batch 1.1:** Multer breaks `AsyncLocalStorage` actor context; files controller passes `req.actor` explicitly into the service after `requireAnyAuthMiddleware`.
- **Phase 1 / Batch 1.5:** Dashboard review endpoints ship in Phase 1 with `testActorMiddleware` + `x-test-dashboard-user-id` header; real JWT `dashboardAuthMiddleware` wiring deferred to Phase 2.
- **Phase 1 / Batch 1.5:** Test `DashboardUser` seeded in `tests/globalSetup.ts` (FK for `company_approval_history.actor_id` and `file_attachments.verified_by`).
- **Phase 2 / Batch 2.2:** MFA/TOTP for dashboard users deferred to Phase 14 pre-launch checklist (§7.4).
- **Phase 2 / Batch 2.3:** `tests/globalSetup.ts` runs full `prisma/seed.ts` (replaces minimal language-only setup).
- **Phase 2 / Batch 2.2:** Refresh tokens include `jti` claim to avoid `token_hash` unique collisions on rapid re-login in tests.
- **Phase 11 / Firebase:** FCM via `firebase-admin`; service account JSON path in `FIREBASE_SERVICE_ACCOUNT_PATH` (gitignored). Push disabled in tests (`VITEST=true`).
- **Phase 14 / OpenAPI:** Supplemental path registrations live in `registerMissingPaths.ts` (imported via `bootstrap.ts`) rather than duplicating every `registerPath` in co-located schema files — keeps §21.6 gate green with minimal drift.
- **Phase 14 / E2E:** Full lifecycle test persists all created rows; inspect via `tests/output/latest-e2e-manifest.json` + Prisma Studio.
- **Phase 15 / Fulfillment:** Delivery is in-house fleet (not marketplace couriers). QR proof scanned by driver confirms `delivered`; company user holds QR payload via `/fulfillment-qr` only.
