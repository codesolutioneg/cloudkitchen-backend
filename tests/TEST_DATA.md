# Cloud Kitchen Backend — Integration Test Data Reference

This document lists the **fixed seed data** and **per-test dynamic data** used across integration tests.

## Fixed seed credentials (prisma/seed.ts)

| Role | Email | Password |
|---|---|---|
| Super Admin (dashboard) | `admin@cloudkitchen.example` | `Admin@12345` |
| Vitest dashboard reviewer | `vitest-dashboard@example.com` | `TestPass123!` |
| Delivery driver (dashboard) | `delivery@cloudkitchen.example` | `Delivery@12345` |

## Fixed seed catalog (orders)

| Entity | UUID | Details |
|---|---|---|
| Category | `00000000-0000-4000-8000-000000000101` | Meals / slug `meals` |
| Product | `00000000-0000-4000-8000-000000000102` | Chicken Meal, **45 SAR** |
| Catalog menu | `00000000-0000-4000-8000-000000000103` | Platform Default Menu |
| Menu section | `00000000-0000-4000-8000-000000000104` | Main |
| Default pricing list | `00000000-0000-4000-8000-000000000099` | SAR default |
| Order approval workflow | `00000000-0000-4000-8000-000000000201` | Super Admin role step |
| Order status workflow | `00000000-0000-4000-8000-000000000001` | submitted → pending_approval → … |

## Fixed global settings

| Key | Value |
|---|---|
| `ordering.default_vat_rate` | `0.15` (15%) |
| `theme.primary_color` | `#2563eb` |
| `notification.order_confirmation.channel` | `email` (not overridable) |

## Fixed business rule (platform)

| Rule type | Value |
|---|---|
| `min_order_qty` | `{ minQty: 1 }` |

## Per-test dynamic data pattern

Each test uses `Date.now()` suffix for isolation.

### Company onboarding (`registerCompany(suffix)`)

- Legal name: `Test Kitchen {suffix}`
- Company email: `company-{suffix}@example.com`
- User email: `user-{suffix}@example.com`
- Password: `SecurePass123!`
- Country: `SA`, phone: `+966500000001`

### Orderable company setup (`setupOrderableCompany(suffix)`)

1. Register with suffix `orders-{suffix}` → user `user-orders-{suffix}@example.com`
2. Dashboard approves with reason: `Approved for integration tests batch {suffix}`
3. Assigns menu `...103` to company scope, priority `10`
4. Company login with `SecurePass123!`

### Default order payload (`buildOrderPayload()`)

```json
{
  "items": [{ "productId": "00000000-0000-4000-8000-000000000102", "quantity": 2 }],
  "requestedDeliveryAt": "<now + 48 hours ISO>",
  "fulfillmentType": "pickup",
  "sourceChannel": "api"
}
```

**Expected totals for qty=2:** subtotal `90`, tax `13.5`, total `103.5` SAR

### Phase 8–10 scenario-specific data

See `tests/integration/phases-8-10.test.ts` and `tests/helpers/orderFixtures.ts`.

## OpenAPI route smoke tests

- **183+ documented operations** — `tests/integration/openapi-routes.test.ts` + `openapi-coverage-gate.test.ts`
- Dashboard token: Super Admin; company token: fresh `openapi-{ts}` company

## Phase 14 — Full lifecycle E2E (faker, persisted)

`tests/integration/full-lifecycle-e2e.test.ts` runs once per suite with **random faker data** (`@faker-js/faker`). Rows are **not deleted**.

After each run, inspect:

| File | Purpose |
|---|---|
| `tests/output/latest-e2e-manifest.json` | Latest run credentials + entity IDs |
| `tests/output/e2e-manifest-{runId}.json` | Historical run archive |

Manifest includes: `companyUserEmail`, `companyPassword`, `companyId`, `productId`, `menuId`, `orderId`, `orderNumber`, and full endpoint hit log.

## Phase 15 — Fulfillment (delivery + pickup)

| Role | Email | Password |
|---|---|---|
| Delivery driver (dashboard) | `delivery@cloudkitchen.example` | `Delivery@12345` |

**Delivery:** `ready` → assign driver → `out_for_delivery` → scan company QR → `delivered`

**Pickup:** `ready` → `awaiting_pickup` → `picked_up` (operations/kitchen)

See `tests/integration/phase-15-fulfillment.test.ts`.
