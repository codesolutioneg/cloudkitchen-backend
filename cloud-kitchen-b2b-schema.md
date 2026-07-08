# Enterprise B2B Cloud Kitchen Platform — Database Architecture
### PostgreSQL + Node.js/TypeScript (Prisma ORM) | Multi-tenant, Metadata-Driven, 5-Year Scalability Target

> **Implementation stack note:** this document is deliberately ORM/framework-agnostic in its table definitions — it describes the PostgreSQL data model only. The canonical backend implementation target is **Node.js (TypeScript) + Prisma + PostgreSQL**; see `CLOUD_KITCHEN_B2B_BACKEND_MASTER_PROMPT.md` for the full stack and `prisma/schema.prisma` for the generated, ready-to-run Prisma schema that implements every table below exactly (including the corrections in **§30**). If this document and `prisma/schema.prisma` ever disagree, treat it as a bug to reconcile — `prisma/schema.prisma` is the literal, compilable expression of this document's final (post-§23/§29/§30) intent, not an independent source of truth.
>
> **Read §30 before implementing anything.** Sections §1–§29 are kept in their original, chronological "design log" form (including superseded ideas, marked as such where the document itself calls them out) so the reasoning trail is preserved. §30 is the final errata pass that (a) fixes every dangling reference to the removed `users` table, (b) narrows a couple of fields that no longer make sense after §23's RBAC split, and (c) gives an explicit "implement / do NOT implement" table list. Where §30 corrects an earlier section, **§30 wins**.

---

## 0. Design Philosophy

This is **not** a restaurant app and **not** a POS. It is a multi-tenant B2B SaaS platform where:

- **Tenants** = Companies (with nested Departments/Users)
- **Catalog owner** = Super Admin only (products are centrally managed, never per-tenant)
- **Everything configurable** = features, permissions, navigation, business rules, workflows, pricing are **data**, not code
- **Nothing is hardcoded**: roles, statuses, menu structures, rule types, and workflow steps are all rows in tables, not enums baked into application logic

### 0.1 Core architectural decisions

| Decision | Reason |
|---|---|
| `uuid` primary keys everywhere (not serial int) | Safe for distributed IDs, replication, exposure in APIs, multi-region future |
| Hybrid Enum strategy | True PostgreSQL `ENUM` types only for **truly fixed** technical states (e.g. `approval_status`). Business-mutable concepts (roles, permissions, order statuses, rule types) are **lookup tables**, so Super Admin can add new ones without a migration |
| `jsonb` metadata columns | Used deliberately on `products`, `business_rules`, `company_configurations`, `audit_logs`, `timeline_events` to absorb "future_*" requirements (nutrition, allergens, AI metadata, etc.) without schema churn |
| Soft delete + audit columns on every business table | `created_at, updated_at, deleted_at, created_by, updated_by, version` (see §1) |
| Row-Level Security (RLS) ready | `company_id` present on every tenant-scoped table; Postgres RLS policies can be layered on later without redesign |
| Append-only tables | `timeline_events`, `audit_logs`, `order_status_history`, `login_history` are insert-only — never updated or deleted |
| Optimistic concurrency | `version int` column (checked-and-incremented on every `UPDATE` — e.g. Prisma `updateMany({ where: { id, version }, data: { version: { increment: 1 }, ... } })` and reject if 0 rows matched — Postgres `xmin` remains available as a defense-in-depth secondary check) on all mutable tables |

### 0.2 Standard column block ("Auditable" — inherited by nearly every table below)

> **Corrected in §30 (originally this block had `created_by uuid REFERENCES users(id)`, which no longer resolves once §23 splits `users` into `company_users`/`dashboard_users` — this is the fixed, final version; do not implement the old FK).**

```
id                uuid            PRIMARY KEY DEFAULT gen_random_uuid()
created_at        timestamptz     NOT NULL DEFAULT now()
updated_at        timestamptz     NOT NULL DEFAULT now()
deleted_at        timestamptz     NULL
created_by_type   varchar(20)     NULL   -- 'company_user' | 'dashboard_user' | 'system'
created_by_id     uuid            NULL   -- polymorphic, NO FK constraint (resolved in the application layer, same pattern as every other actor/entity_type+entity_id pair in this document)
updated_by_type   varchar(20)     NULL
updated_by_id     uuid            NULL
is_deleted        boolean         NOT NULL DEFAULT false
version           integer         NOT NULL DEFAULT 1        -- optimistic concurrency
```
To keep the document readable, every table below is described **only with its business columns**; assume the Auditable block is present unless stated otherwise (a few pure log/timeline tables are append-only and omit `updated_*`/`deleted_at` on purpose — noted explicitly). Wherever an individual table's own description below still shows a bare `created_by`/`updated_by uuid FK → users`, that mention is stale — it means the plain Auditable block above, nothing table-specific; **§30.1** restates this explicitly so it is impossible to miss.

---

## 1. MODULE: Companies & Onboarding

### 1.1 `companies`
Why it exists: the tenant root. Every other tenant-scoped row hangs off `company_id`.

| Column | Type | Notes |
|---|---|---|
| legal_name | varchar(255) | NOT NULL |
| trade_name | varchar(255) | display name |
| commercial_registration_no | varchar(100) | UNIQUE |
| tax_registration_no | varchar(100) | VAT/TRN, UNIQUE |
| national_address_no | varchar(100) | GCC-specific (Saudi National Address / UAE Makani etc.) |
| industry_sector | varchar(150) | free text or FK to `industry_sectors` lookup |
| company_size | varchar(50) | e.g. 1-50, 51-200 (lookup-able) |
| country_code | char(2) | ISO 3166-1 |
| city | varchar(100) | |
| primary_contact_name | varchar(150) | |
| primary_contact_title | varchar(100) | job title |
| primary_email | varchar(255) | NOT NULL |
| primary_phone | varchar(30) | E.164 |
| secondary_phone | varchar(30) | NULL |
| website | varchar(255) | NULL |
| logo_document_id | uuid | FK → `documents.id` |
| default_currency | char(3) | ISO 4217, e.g. SAR/AED/EGP |
| default_timezone | varchar(64) | IANA tz, e.g. `Asia/Riyadh` |
| default_language | varchar(10) | e.g. `ar`, `en` |
| status | `company_status` ENUM | `pending, active, suspended, blocked, closed` |
| approval_status | `approval_status` ENUM | `pending, under_review, approved, rejected, resubmission_required` |
| approval_notes | text | NULL |
| approved_by | uuid | FK → `users.id`, NULL |
| approved_at | timestamptz | NULL |
| onboarding_source | varchar(50) | `self_signup, sales_lead, admin_created` |
| parent_company_id | uuid | FK → `companies.id`, NULL — supports future group/holding company hierarchies |

**Indexes:** unique on `commercial_registration_no`, `tax_registration_no`; btree on `status`, `approval_status`; gin on future jsonb metadata if added.

### 1.2 `company_documents`
Why: every registration needs Trade License, CR file, Tax Certificate, logo, plus future document types — modeled generically instead of one column per document type so new required documents never need a migration.

| Column | Type | Notes |
|---|---|---|
| company_id | uuid | FK → companies |
| document_type | varchar(50) | lookup: `trade_license, commercial_registration, tax_certificate, logo, authorization_letter, bank_letter, other` |
| file_url | text | storage path/CDN URL |
| file_name | varchar(255) | |
| mime_type | varchar(100) | |
| file_size_bytes | bigint | |
| issue_date | date | NULL |
| expiry_date | date | NULL — enables future "expiring documents" alerts |
| verification_status | varchar(30) | `pending, verified, rejected` |
| verified_by | uuid | FK → users, NULL |
| verified_at | timestamptz | NULL |

**Index:** `(company_id, document_type)`.

### 1.3 `company_addresses`
Why: companies need one billing address plus N delivery addresses (branches/departments), each independently.

| Column | Type | Notes |
|---|---|---|
| company_id | uuid | FK |
| address_type | varchar(20) | `billing, delivery` |
| label | varchar(100) | e.g. "HQ - Riyadh", "Warehouse 2" |
| address_line1 / address_line2 | varchar(255) | |
| city, state_province, country_code | varchar | |
| postal_code | varchar(20) | NULL |
| latitude / longitude | numeric(9,6) | for delivery-zone/rules engine later |
| contact_name / contact_phone | varchar | on-site contact per delivery address |
| is_default | boolean | one default per `address_type` per company (partial unique index) |

**Constraint:** partial unique index `(company_id, address_type) WHERE is_default = true`.

### 1.4 `company_approval_history`
Why: approval is a multi-step process (submitted → under review → approved/rejected → resubmitted); this is the immutable trail, separate from the current `companies.approval_status` snapshot.

| Column | Type | Notes |
|---|---|---|
| company_id | uuid | FK |
| from_status | varchar(30) | |
| to_status | varchar(30) | |
| actor_id | uuid | FK → users |
| reason | text | NULL |
| created_at | timestamptz | append-only, no update/delete |

---

## 2. MODULE: Users, Roles & Company Structure

### 2.1 `users`
Single identity table for **all** humans in the system (Super Admin staff + Company staff), differentiated by `user_type`. Keeping one table simplifies auth, sessions, audit `actor_id` FKs platform-wide.

| Column | Type | Notes |
|---|---|---|
| company_id | uuid | FK → companies, **NULL for platform/Super Admin users** |
| department_id | uuid | FK → `departments.id`, NULL |
| user_type | varchar(20) | `platform, company` |
| full_name | varchar(150) | |
| email | citext | UNIQUE |
| mobile | varchar(30) | UNIQUE, NULL |
| password_hash | text | |
| password_algo | varchar(20) | e.g. `bcrypt`, `argon2` — future-proofs algorithm migration |
| status | varchar(20) | `active, inactive, locked, invited` |
| last_login_at | timestamptz | NULL |
| mfa_enabled | boolean | default false |
| preferred_language | varchar(10) | NULL |

### 2.2 `departments`
Why: "Department Menu" and department-level exceptions in business rules require companies to have internal structure beyond flat user lists.

| Column | Type |
|---|---|
| company_id | uuid FK |
| name | varchar(150) |
| cost_center_code | varchar(50) NULL |
| parent_department_id | uuid FK → departments.id (self-referencing, nested departments) |

### 2.3 `roles`
Not hardcoded. Roles are data; both **platform roles** (e.g. Super Admin, Support) and **company roles** (Admin, Manager, Employee, Purchasing, Viewer) live here, distinguished by `scope`.

| Column | Type | Notes |
|---|---|---|
| company_id | uuid | FK, NULL = **global/system role template**, usable by any company |
| name | varchar(100) | |
| scope | varchar(20) | `platform, company` |
| is_system_role | boolean | true = seeded, can't be deleted (e.g. "Admin") |
| description | text | NULL |

**Unique:** `(company_id, name)` — a company can define its own custom roles alongside system templates.

### 2.4 `permissions`
Atomic capability, e.g. `orders.create`, `orders.approve`, `reports.export`.

| Column | Type |
|---|---|
| code | varchar(150) UNIQUE, e.g. `order.create` |
| name | varchar(150) |
| permission_group_id | uuid FK → `permission_groups.id` |
| description | text NULL |

### 2.5 `permission_groups`
Logical grouping for UI presentation ("Orders", "Products", "Reports", "Administration").

| Column | Type |
|---|---|
| name | varchar(100) |
| sort_order | int |

### 2.6 `role_permissions` (many-to-many)
| Column | Type |
|---|---|
| role_id | uuid FK |
| permission_id | uuid FK |
| effect | varchar(10) | `allow, deny` — supports explicit deny, not just additive allow |

**Unique:** `(role_id, permission_id)`.

### 2.7 `user_roles` (many-to-many, a user may hold multiple roles)
| Column | Type |
|---|---|
| user_id | uuid FK |
| role_id | uuid FK |
| assigned_by | uuid FK → users |
| assigned_at | timestamptz |

### 2.8 `role_inheritance`
Supports "Manager inherits Employee permissions" style hierarchies without duplicating rows.

| Column | Type |
|---|---|
| parent_role_id | uuid FK → roles |
| child_role_id | uuid FK → roles |

### 2.9 `permission_overrides`
Per-company or per-user exceptions layered on top of role permissions (e.g. "this one Purchasing user at Company X can also approve orders").

| Column | Type | Notes |
|---|---|---|
| scope_type | varchar(20) | `company, user` |
| scope_id | uuid | company_id or user_id depending on scope_type |
| permission_id | uuid FK |
| effect | varchar(10) | `allow, deny` |
| reason | text | NULL |
| expires_at | timestamptz | NULL — temporary overrides |

### 2.10 `policies` (ABAC-ready, future)
Why included now though not fully used: attribute-based access control needs a condition-evaluation table from day one so it can be switched on later without a redesign.

| Column | Type |
|---|---|
| name | varchar(150) |
| effect | varchar(10) `allow/deny` |
| conditions | jsonb — e.g. `{"attribute":"order.total","op":"<=","value":5000}` |
| applies_to | varchar(20) `role, user, company` |
| target_id | uuid |
| priority | int |

**Why this design:** roles give you coarse RBAC; `permission_overrides` gives exceptions; `policies` gives you a future ABAC escape hatch — three layers resolved at runtime by the authorization engine (role → override → policy, most specific wins).

---

## 2A. MODULE: Feature Management System

### 2A.1 `features`
The master catalog of toggleable capabilities (Orders, Reports, Tracking, Bulk Orders, Favorites, Coupons, Payments, Export Excel, …).

| Column | Type | Notes |
|---|---|---|
| code | varchar(100) UNIQUE | e.g. `bulk_orders`, `export_excel` |
| name | varchar(150) | |
| feature_group_id | uuid FK | |
| description | text NULL | |
| is_global_default_enabled | boolean | default state for newly onboarded companies |
| requires_permission_id | uuid FK → permissions, NULL | a feature can gate on top of a permission |

### 2A.2 `feature_groups`
| Column | Type |
|---|---|
| name | varchar(100) — "Ordering", "Reporting", "Engagement" |
| sort_order | int |

### 2A.3 `company_features`
Per-tenant override of a feature (enable/disable per company, with optional rollout window).

| Column | Type | Notes |
|---|---|---|
| company_id | uuid FK |
| feature_id | uuid FK |
| is_enabled | boolean |
| enabled_from | timestamptz NULL |
| enabled_until | timestamptz NULL | temporary trials |
| config | jsonb NULL | per-feature config, e.g. `{"max_bulk_rows":500}` |

**Unique:** `(company_id, feature_id)`.

### 2A.4 `feature_flags`
Distinct from `features`: these are **platform-level, release-engineering flags** (percentage rollout, environment-based, kill switches) — the classic SaaS feature-flag pattern, separate from business feature entitlement above.

| Column | Type |
|---|---|
| key | varchar(150) UNIQUE |
| description | text |
| is_enabled_globally | boolean |
| rollout_percentage | smallint (0-100) |
| environment | varchar(20) `production, staging, all` |
| targeting_rules | jsonb — e.g. `{"company_ids":[...]}` for targeted rollout |

### 2A.5 `visibility_rules`
Generic rule table reused by navigation, menus, and features: "hide X unless condition Y."

| Column | Type |
|---|---|
| target_type | varchar(30) `navigation_item, feature, menu, product` |
| target_id | uuid |
| scope_type | varchar(20) `company, role, user, department` |
| scope_id | uuid |
| is_visible | boolean |
| effective_from / effective_to | timestamptz NULL |

---

## 2B. MODULE: Dynamic Dashboard / Navigation

### 2B.1 `navigation_menus`
The entire sidebar is rows in this table, self-referencing for nesting.

| Column | Type | Notes |
|---|---|---|
| parent_id | uuid FK → navigation_menus.id, NULL | nested menus |
| name | varchar(100) | |
| icon | varchar(100) | icon key/class name |
| url | varchar(255) | NULL for parent-only group headers |
| sort_order | int | |
| is_enabled | boolean | global kill switch |
| feature_id | uuid FK → features, NULL | menu only shows if this feature is enabled for the company |
| required_permission_id | uuid FK → permissions, NULL | menu only shows if actor holds this permission |
| tenant_visibility | varchar(20) | `all, whitelist, blacklist` — resolved together with `visibility_rules` |

### 2B.2 `navigation_menu_overrides`
Explicit per-company / per-role / per-user hide-or-show, when `visibility_rules` generic table isn't granular enough for UI-specific needs (kept separate from `visibility_rules` to isolate performance-critical sidebar queries).

| Column | Type |
|---|---|
| navigation_menu_id | uuid FK |
| scope_type | varchar(20) `company, role, user` |
| scope_id | uuid |
| is_visible | boolean |

**Design note:** frontend fetches `GET /me/navigation` → backend resolves `navigation_menus` ⋈ `company_features` ⋈ `role_permissions` ⋈ `navigation_menu_overrides` into a tree, cached per (user, company) with short TTL.

---

## 3. MODULE: Product Information Management (PIM)

Products are **owned exclusively by Super Admin** — no `company_id` on any table in this module.

### 3.1 `categories` (self-referencing → categories + subcategories)
| Column | Type |
|---|---|
| parent_category_id | uuid FK → categories.id, NULL |
| name | varchar(150) |
| slug | varchar(150) UNIQUE |
| sort_order | int |
| is_active | boolean |
| image_document_id | uuid FK → documents, NULL |

### 3.2 `products`
| Column | Type | Notes |
|---|---|---|
| category_id | uuid FK | |
| sku | varchar(100) UNIQUE NULL | future POS/ERP mapping |
| barcode | varchar(100) NULL | future |
| name | varchar(255) | default language |
| description | text | NULL |
| base_price | numeric(12,2) | |
| currency | char(3) | |
| tax_class | varchar(50) | NULL — links to VAT config |
| is_active | boolean | |
| visibility | varchar(20) | `public, restricted` — restricted = only visible via explicit menu assignment |
| sort_order | int | |
| erp_reference_id | varchar(100) | NULL, future ERP mapping |
| pos_reference_id | varchar(100) | NULL, future POS mapping |
| search_metadata | jsonb | NULL — future SEO/search-engine/AI embeddings keys |
| attributes | jsonb | NULL — future nutrition, allergens, calories, ingredients, tags, until dedicated tables are needed at scale |

**Why jsonb `attributes` instead of columns for nutrition/allergens/calories now:** these evolve rapidly (new regulations, new markets) — modeling them as columns means migrations every time a GCC market adds a new mandatory disclosure. `attributes` gives Super Admin immediate flexibility; a later "graduate to real columns/tables when query patterns stabilize" migration remains straightforward since jsonb keys map 1:1 to future columns.

### 3.3 `product_translations`
Because Arabic/English (and future languages) must not create duplicate products.

| Column | Type |
|---|---|
| product_id | uuid FK |
| language_code | varchar(10) |
| name | varchar(255) |
| description | text NULL |

**Unique:** `(product_id, language_code)`.

### 3.4 `product_media`
| Column | Type |
|---|---|
| product_id | uuid FK |
| media_type | varchar(20) `image, video` |
| url | text |
| sort_order | int |
| is_primary | boolean |

### 3.5 `product_variants`
E.g. sizes (Small/Medium/Large), each with its own price/SKU.

| Column | Type |
|---|---|
| product_id | uuid FK |
| variant_name | varchar(150) |
| sku | varchar(100) NULL |
| price_adjustment | numeric(12,2) | delta over base_price |
| is_default | boolean |
| is_active | boolean |

### 3.6 `product_option_groups` / `product_options`
E.g. "Choose sauce" (group) → Ketchup, Mayo, BBQ (options), each with optional price delta.

`product_option_groups`: product_id, name, selection_type (`single, multiple`), min_select, max_select, is_required.
`product_options`: option_group_id, name, price_adjustment, is_active, sort_order.

### 3.7 `product_availability`
Time/day-based availability (e.g. breakfast items only 6–11am) — independent of menu assignment.

| Column | Type |
|---|---|
| product_id | uuid FK |
| day_of_week | smallint NULL (0-6), NULL = every day |
| start_time / end_time | time NULL |
| available_from / available_to | date NULL — seasonal availability |

### 3.8 `tags` / `product_tags` (many-to-many)
Free-form future tagging ("Vegan", "New", "Chef's Special") without schema change.

### 3.9 `product_pricing_lists` / `product_prices` (future dynamic/company-tiered pricing)
Why included now: enterprise contracts commonly negotiate different prices per corporate client.

`product_pricing_lists`: name, currency, is_default.
`product_prices`: pricing_list_id, product_id, variant_id NULL, price, effective_from, effective_to.
`company_pricing_list_assignment`: company_id, pricing_list_id, effective_from/to.

---

## 4. MODULE: Menu Assignment (catalog menus, NOT navigation menus)

Naming deliberately distinct from `navigation_menus` (§2B) to avoid ambiguity between "sidebar menu" and "food menu."

### 4.1 `catalog_menus`
The reusable menu definitions: General Menu, Breakfast, VIP Menu, Campaign Menu, etc.

| Column | Type | Notes |
|---|---|---|
| name | varchar(150) | |
| menu_type | varchar(30) | `general, standard, department, user, temporary, campaign, vip` |
| description | text NULL |
| is_active | boolean |

### 4.2 `catalog_menu_sections`
Sub-groupings within a menu (Breakfast/Lunch/Desserts inside one menu, or standalone).

| Column | Type |
|---|---|
| catalog_menu_id | uuid FK |
| name | varchar(150) |
| sort_order | int |

### 4.3 `catalog_menu_products` (many-to-many — the critical "no duplication" table)
Products are never copied; they're only **referenced**.

| Column | Type |
|---|---|
| catalog_menu_section_id | uuid FK |
| product_id | uuid FK |
| sort_order | int |
| is_featured | boolean |

**Unique:** `(catalog_menu_section_id, product_id)`.

### 4.4 `menu_assignments`
Assigns a `catalog_menu` to a scope (company / department / user / campaign), with scheduling and priority so overlapping assignments resolve deterministically (e.g. VIP Menu for one user overrides Company Menu).

| Column | Type | Notes |
|---|---|---|
| catalog_menu_id | uuid FK | |
| scope_type | varchar(20) | `company, department, user, campaign` |
| scope_id | uuid | |
| priority | int | higher wins on conflict |
| effective_from | timestamptz | |
| effective_to | timestamptz NULL | NULL = open-ended |
| is_active | boolean | |

**Index:** `(scope_type, scope_id, is_active)`; resolution query orders by `priority DESC, effective_from DESC`.

---

## 5. MODULE: Business Rules Engine (fully metadata-driven)

Rather than one column per rule type (which breaks the "extendable without schema changes" requirement), rules are stored generically.

### 5.1 `rule_types` (lookup, not hardcoded)
| Column | Type |
|---|---|
| code | varchar(100) UNIQUE — `min_order_qty, max_order_qty, min_notice_hours, allowed_delivery_days, cutoff_time, blackout_dates, ...` |
| name | varchar(150) |
| value_schema | jsonb | JSON-schema describing the expected shape of `business_rules.value`, so the admin UI can render the right input control |

### 5.2 `business_rules`
| Column | Type | Notes |
|---|---|---|
| rule_type_id | uuid FK | |
| scope_type | varchar(20) | `platform, company, department, user, product, category` |
| scope_id | uuid NULL | NULL when scope_type = platform |
| value | jsonb | e.g. `{"min":5}`, `{"days":["mon","tue"]}`, `{"cutoff":"14:00"}` |
| priority | int | resolves conflicts when platform + company + user rules overlap (most specific/highest priority wins) |
| effective_from / effective_to | timestamptz NULL | |
| notes | text NULL |

**Index:** `(rule_type_id, scope_type, scope_id)`.

**Why this covers the entire "Ordering Rules" + "Admin Settings" requirement:** MOQ, MaxOQ, notice hours, max daily/weekly/monthly orders, allowed delivery days/slots, cutoff time, advance ordering hours, ordering window, blackout dates, holiday rules, VAT, service charge, delivery fees, enable-coupons/discounts/pickup/delivery — **every one of these is just a row** with a different `rule_type_id`, at whichever scope (platform-wide default, overridden per company, overridden per department/user). No migration needed to add a new rule type; only a new `rule_types` row + optional UI hint via `value_schema`.

### 5.3 `calendars` / `calendar_events`
Supports Working Calendar + Holiday Calendar + blackout periods referenced by business rules.

`calendars`: name, country_code NULL, company_id NULL (NULL = shared/global calendar).
`calendar_events`: calendar_id, event_date, event_type (`holiday, blackout, special_hours`), name, metadata jsonb.

---

## 6. MODULE: Company Configuration (non-rule settings: branding, currency, notification prefs)

Kept separate from `business_rules` because these are **not conditional/ordering logic** — they're tenant preferences/branding, and benefit from versioning as a whole snapshot rather than per-key priority resolution.

### 6.1 `company_configurations`
| Column | Type | Notes |
|---|---|---|
| company_id | uuid FK | |
| config_key | varchar(150) | e.g. `theme.primary_color`, `notification.order_confirmation.channel` |
| config_value | jsonb | |
| config_version | int | incremented on every change |
| is_active | boolean | only one active row per key (partial unique) |

**Unique (partial):** `(company_id, config_key) WHERE is_active = true`.

### 6.2 `company_configuration_history`
Append-only snapshot on every version bump — enables full config rollback/audit trail distinct from the generic `audit_logs` (this one stores full resolved config blobs, useful for "config as of date X" queries).

| Column | Type |
|---|---|
| company_id | uuid FK |
| config_key | varchar(150) |
| config_value | jsonb |
| config_version | int |
| changed_by | uuid FK → users |
| changed_at | timestamptz |

---

## 7. MODULE: Workflow Engine (order statuses are NOT hardcoded)

### 7.1 `workflows`
A workflow definition, potentially different per company (e.g. Company A requires manager approval, Company B doesn't).

| Column | Type |
|---|---|
| name | varchar(150) |
| workflow_type | varchar(30) `order, company_approval, other_future` |
| company_id | uuid FK NULL | NULL = default/global workflow template |
| is_active | boolean |

### 7.2 `workflow_steps`
| Column | Type |
|---|---|
| workflow_id | uuid FK |
| code | varchar(100) — e.g. `submitted, pending_approval, kitchen_accepted, preparing, ready, delivered, cancelled, refunded` |
| name | varchar(150) |
| step_type | varchar(20) `initial, intermediate, final` |
| sla_minutes | int NULL | escalation trigger threshold |
| sort_order | int |

### 7.3 `workflow_transitions`
Defines legal moves between steps, plus who/what can trigger them.

| Column | Type |
|---|---|
| workflow_id | uuid FK |
| from_step_id | uuid FK → workflow_steps, NULL (NULL = from "any step") |
| to_step_id | uuid FK → workflow_steps |
| trigger_type | varchar(20) `manual, automatic, scheduled` |
| required_permission_id | uuid FK → permissions, NULL — who is allowed to trigger manually |

### 7.4 `workflow_conditions`
Attached to a transition; evaluated before allowing it (e.g. "order total > 5000 requires Manager approval step").

| Column | Type |
|---|---|
| workflow_transition_id | uuid FK |
| condition_expression | jsonb — structured condition, evaluated by rules engine |

### 7.5 `workflow_actions`
Side effects fired on entering a step (send notification, call webhook, auto-approve).

| Column | Type |
|---|---|
| workflow_step_id | uuid FK |
| action_type | varchar(30) `notify, webhook, auto_transition, escalate` |
| action_config | jsonb |

### 7.6 `entity_workflow_instances`
Generic: tracks the **current** workflow step for any entity (order, company approval, etc.) — generic `entity_type/entity_id` so the same engine serves multiple domains.

| Column | Type |
|---|---|
| workflow_id | uuid FK |
| entity_type | varchar(50) `order, company` |
| entity_id | uuid |
| current_step_id | uuid FK → workflow_steps |
| entered_step_at | timestamptz |
| sla_due_at | timestamptz NULL |

### 7.7 `entity_workflow_history` (append-only)
| Column | Type |
|---|---|
| workflow_instance_id | uuid FK |
| from_step_id | uuid FK NULL |
| to_step_id | uuid FK |
| actor_id | uuid FK → users NULL (NULL = system/automatic) |
| transitioned_at | timestamptz |
| comment | text NULL |

---

## 8. MODULE: Orders

### 8.1 `orders`
| Column | Type | Notes |
|---|---|---|
| company_id | uuid FK | |
| department_id | uuid FK NULL | |
| ordered_by_user_id | uuid FK → users | |
| order_number | varchar(50) UNIQUE | human-readable, generated |
| workflow_instance_id | uuid FK → entity_workflow_instances, NULL | current status lives here, not a hardcoded enum |
| currency | char(3) | |
| subtotal_amount | numeric(14,2) | |
| discount_amount | numeric(14,2) | default 0 |
| tax_amount | numeric(14,2) | default 0 |
| service_charge_amount | numeric(14,2) | default 0 |
| delivery_fee_amount | numeric(14,2) | default 0 |
| total_amount | numeric(14,2) | |
| requested_delivery_at | timestamptz | |
| delivery_address_id | uuid FK → company_addresses, NULL | |
| fulfillment_type | varchar(20) | `delivery, pickup` |
| coupon_id | uuid FK NULL | future coupons |
| source_channel | varchar(20) | `web, mobile, api` |
| is_bulk_order | boolean | future bulk-order flag |
| parent_order_id | uuid FK → orders.id, NULL | future "reorder"/split-order lineage |

**Indexes:** `(company_id, created_at desc)`, `(order_number)` unique, `(workflow_instance_id)`.

### 8.2 `order_items`
| Column | Type |
|---|---|
| order_id | uuid FK |
| product_id | uuid FK |
| variant_id | uuid FK NULL |
| product_name_snapshot | varchar(255) | denormalized at order time (product data can change later) |
| unit_price_snapshot | numeric(12,2) | |
| quantity | int |
| line_total | numeric(14,2) |
| notes | text NULL |

### 8.3 `order_item_options` (selected product options, e.g. chosen sauce)
| Column | Type |
|---|---|
| order_item_id | uuid FK |
| product_option_id | uuid FK |
| price_adjustment_snapshot | numeric(12,2) |

### 8.4 `order_status_history` (kept as a lightweight convenience log in addition to §7.7's generic workflow history — denormalized for fast "order timeline" UI reads without joining through workflow tables)
| Column | Type |
|---|---|
| order_id | uuid FK |
| status_code | varchar(50) |
| changed_by | uuid FK NULL |
| changed_at | timestamptz |
| comment | text NULL |

### 8.5 `order_notes`
| Column | Type |
|---|---|
| order_id | uuid FK |
| author_id | uuid FK |
| note | text |
| is_internal | boolean | internal (kitchen/admin) vs visible to company user |

### 8.6 `order_attachments`
| Column | Type |
|---|---|
| order_id | uuid FK |
| file_url | text |
| file_name | varchar(255) |
| uploaded_by | uuid FK |

### 8.7 `order_approvals`
| Column | Type |
|---|---|
| order_id | uuid FK |
| approver_id | uuid FK → users |
| approval_level | int | supports multi-level approval chains |
| status | varchar(20) `pending, approved, rejected` |
| decided_at | timestamptz NULL |
| comment | text NULL |

### 8.8 `order_delivery_details`
| Column | Type |
|---|---|
| order_id | uuid FK |
| driver_name | varchar(150) NULL | future driver assignment (pre-modeled) |
| driver_phone | varchar(30) NULL |
| vehicle_info | varchar(150) NULL |
| tracking_reference | varchar(100) NULL |
| delivered_at | timestamptz NULL |
| delivery_proof_document_id | uuid FK NULL |

### 8.9 `order_cancellations`
| Column | Type |
|---|---|
| order_id | uuid FK |
| cancelled_by | uuid FK |
| reason_code | varchar(50) | lookup-able |
| reason_text | text NULL |
| cancelled_at | timestamptz |

### 8.10 Future tables (structure sketched now, not activated)
- `invoices` (order_id, invoice_number, pdf_document_id, issued_at, due_at)
- `payments` (order_id, payment_method, gateway_reference, amount, status)
- `refunds` (order_id, payment_id, amount, reason, status)
- `driver_assignments` (order_id, driver_id, assigned_at) — once drivers become platform entities rather than free-text on `order_delivery_details`
- `kitchen_statuses` — if kitchen ops need a separate sub-workflow from the customer-facing order status

---

## 9. MODULE: Tracking Timeline (immutable, generic, append-only)

### 9.1 `timeline_events`
One unified, **never updated, never deleted** event stream for everything: company registered/approved, menu assigned, order lifecycle, etc.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| entity_type | varchar(50) | `company, order, menu_assignment, user, ...` |
| entity_id | uuid | |
| event_code | varchar(100) | `company_registered, order_created, kitchen_accepted, delivered, ...` (lookup-able, not enum) |
| actor_id | uuid FK → users, NULL | NULL = system |
| actor_role | varchar(100) | denormalized role name at time of event |
| source | varchar(30) | `web, mobile, api, system` |
| device_info | varchar(255) | NULL |
| ip_address | inet | NULL |
| geo_location | point/jsonb | NULL — lat/lng if available |
| comment | text | NULL |
| attachment_document_id | uuid FK NULL | |
| metadata | jsonb | NULL — free-form extra context |
| occurred_at | timestamptz | NOT NULL DEFAULT now() |

**No `updated_at`/`deleted_at`/`is_deleted`** — this table is intentionally append-only by design; "immutable" is enforced at the application layer and can be additionally enforced with a DB trigger that rejects UPDATE/DELETE.

**Indexes:** `(entity_type, entity_id, occurred_at)`, `(event_code)`, BRIN index on `occurred_at` for cheap time-range scans at large volume.

---

## 10. MODULE: Notifications

### 10.1 `notification_templates`
| Column | Type |
|---|---|
| code | varchar(100) UNIQUE — `order_confirmed, order_delivered, approval_required` |
| channel | varchar(20) `email, sms, push, in_app, system` |
| subject_template | text NULL |
| body_template | text |
| language_code | varchar(10) |

### 10.2 `notifications`
| Column | Type |
|---|---|
| template_id | uuid FK NULL |
| channel | varchar(20) |
| recipient_user_id | uuid FK NULL |
| recipient_company_id | uuid FK NULL | for company-wide broadcasts |
| subject | text NULL |
| body | text |
| status | varchar(20) `queued, sent, delivered, failed, read` |
| sent_at | timestamptz NULL |
| read_at | timestamptz NULL |
| related_entity_type | varchar(50) NULL |
| related_entity_id | uuid NULL |

### 10.3 `device_tokens`
| Column | Type |
|---|---|
| user_id | uuid FK |
| platform | varchar(20) `ios, android, web` |
| token | text |
| is_active | boolean |
| last_used_at | timestamptz |

---

## 11. MODULE: Security & Authentication

### 11.1 `user_sessions`
| Column | Type |
|---|---|
| user_id | uuid FK |
| session_token_hash | text |
| ip_address | inet |
| user_agent | text |
| created_at / expires_at | timestamptz |
| revoked_at | timestamptz NULL |

### 11.2 `refresh_tokens`
| Column | Type |
|---|---|
| user_id | uuid FK |
| token_hash | text UNIQUE |
| issued_at / expires_at | timestamptz |
| revoked_at | timestamptz NULL |
| replaced_by_token_id | uuid FK NULL | rotation chain |

### 11.3 `login_history` (append-only)
| Column | Type |
|---|---|
| user_id | uuid FK NULL | NULL if login attempt used unknown email |
| attempted_email | varchar(255) |
| success | boolean |
| failure_reason | varchar(100) NULL |
| ip_address | inet |
| user_agent | text |
| occurred_at | timestamptz |

### 11.4 `password_reset_tokens`
| Column | Type |
|---|---|
| user_id | uuid FK |
| token_hash | text UNIQUE |
| expires_at | timestamptz |
| used_at | timestamptz NULL |

### 11.5 `otp_codes`
| Column | Type |
|---|---|
| user_id | uuid FK NULL |
| destination | varchar(255) | phone/email OTP was sent to |
| purpose | varchar(30) `login, registration, password_reset` |
| code_hash | text |
| expires_at | timestamptz |
| consumed_at | timestamptz NULL |
| attempt_count | smallint default 0 |

---

## 12. MODULE: Generic Audit System

### 12.1 `audit_logs` (append-only, universal — covers every table, no per-table audit tables needed)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| entity_name | varchar(100) | table name, e.g. `orders` |
| entity_id | uuid | |
| action | varchar(20) | `insert, update, delete, restore` |
| old_values | jsonb | NULL for insert |
| new_values | jsonb | NULL for delete |
| changed_fields | jsonb | array of field names that changed |
| changed_by | uuid FK → users, NULL | NULL = system |
| changed_at | timestamptz | |
| reason | text NULL | |
| source | varchar(30) | `api, admin_panel, system_job` |
| correlation_id | uuid | ties together multiple audit rows from one logical operation |
| request_id | uuid NULL | ties to the originating HTTP request/trace |

**Indexes:** `(entity_name, entity_id, changed_at)`, `(correlation_id)`.

**Soft delete + restore policy:** business tables never hard-delete; `DELETE` operations in the app layer set `is_deleted = true, deleted_at = now()`. A `restore` action simply flips it back and is itself audited via `audit_logs.action = 'restore'`.

---

## 13. Enum Types (true PostgreSQL ENUMs — reserved for genuinely fixed, rarely-changing technical states only)

```sql
CREATE TYPE company_status AS ENUM ('pending','active','suspended','blocked','closed');
CREATE TYPE approval_status AS ENUM ('pending','under_review','approved','rejected','resubmission_required');
CREATE TYPE document_verification_status AS ENUM ('pending','verified','rejected');
CREATE TYPE fulfillment_type AS ENUM ('delivery','pickup');
```
Everything more business-mutable (roles, permissions, order/workflow statuses, rule types, notification channels) is deliberately a **lookup table**, not a native enum, precisely because "do not hardcode X" was a recurring requirement — native Postgres enums require a migration (`ALTER TYPE ... ADD VALUE`) to extend, which defeats that goal.

---

## 14. Relationship Summary (textual ER overview)

```
companies 1───N company_users(users where user_type='company')
companies 1───N company_addresses
companies 1───N company_documents
companies 1───N departments
companies 1───N company_features
companies 1───N business_rules (scope_type='company')
companies 1───N company_configurations
companies 1───N orders

users N───N roles (via user_roles)
roles N───N permissions (via role_permissions)
roles N───N roles (via role_inheritance, self-referencing)

categories 1───N categories (self-ref subcategories)
categories 1───N products
products 1───N product_variants / product_media / product_translations / product_option_groups
products N───N catalog_menu_sections (via catalog_menu_products)

catalog_menus 1───N catalog_menu_sections 1───N catalog_menu_products
catalog_menus 1───N menu_assignments (polymorphic scope: company/department/user/campaign)

workflows 1───N workflow_steps 1───N workflow_transitions
orders 1───1 entity_workflow_instances (entity_type='order')
entity_workflow_instances 1───N entity_workflow_history

orders 1───N order_items 1───N order_item_options
orders 1───N order_notes / order_attachments / order_approvals / order_status_history
orders 1───1 order_delivery_details
orders 1───1 order_cancellations (nullable, only if cancelled)

navigation_menus 1───N navigation_menus (self-ref nested sidebar)
navigation_menus N───1 features (optional dependency)
navigation_menus N───1 permissions (optional dependency)

audit_logs, timeline_events, login_history → polymorphic, reference no FK directly (entity_type + entity_id pattern) by design, so they never block deletion/schema evolution of the tables they observe
```

---

## 15. Indexing Strategy (beyond per-table notes above)

- Every `company_id` FK column: btree index (tenant-scoped query performance, and RLS policy support).
- Every polymorphic `(entity_type, entity_id)` pair: composite btree index.
- `jsonb` columns queried by key (`products.attributes`, `business_rules.value`, `company_configurations.config_value`): GIN indexes added selectively once real query patterns are known — avoid over-indexing jsonb on day one.
- Append-only high-volume tables (`timeline_events`, `audit_logs`, `login_history`): BRIN index on the timestamp column — far cheaper than btree at scale for time-ordered inserts.
- Partial unique indexes used wherever "one default/active row" semantics apply (`company_addresses.is_default`, `company_configurations.is_active`).

---

## 16. Future Scalability Recommendations

1. **Table partitioning**: partition `orders`, `timeline_events`, and `audit_logs` by month (native Postgres declarative partitioning) once volume passes a few million rows — schema above is partition-friendly since none of these use serial PKs.
2. **Read replicas** for reporting/analytics workloads (Reports/Analytics feature) to avoid impacting OLTP order-taking.
3. **Outbox pattern**: add an `outbox_events` table for reliable event publishing (order created → downstream notification/analytics services) once the platform moves toward microservices or event-driven architecture.
4. **Multi-currency/multi-region**: `default_currency`/`default_timezone` already at company level; if the platform expands to multiple legal entities per country, promote `country_code` into a `legal_entities` table sitting between platform and companies.
5. **Search**: once product catalog grows, sync `products`/`product_translations` into Elasticsearch/OpenSearch or Postgres full-text (`tsvector` generated column) — `search_metadata jsonb` already reserves the hook.
6. **Caching layer**: `navigation_menus`, `company_features`, and resolved `business_rules` are read-heavy/write-light — ideal Redis cache candidates keyed by `company_id`/`user_id`, invalidated on the relevant write.
7. **API rate limiting/API permissions**: `permissions` table already models `api.*` codes; a dedicated `api_keys` table (company_id, key_hash, scopes, rate_limit) should be added when third-party/API access is opened to corporate clients.
8. **GraphQL/BFF consideration**: given how relational this schema is (menus, features, navigation all resolved per-user), a BFF or GraphQL layer will likely simplify frontend consumption more than pure REST as the number of conditional joins grows.

---

## 17. Tables Not Needed Immediately, But Worth Reserving Names/Space For

| Table | When to build it |
|---|---|
| `invoices`, `payments`, `refunds` | when finance/billing module is scoped |
| `driver_assignments` | when delivery moves from 3rd-party/manual to platform-managed fleet |
| `kitchen_statuses` | if kitchen operations need a workflow independent of customer-facing order status |
| `coupons`, `discounts` | when promotions module is scoped (`orders.coupon_id` already reserved) |
| `api_keys`, `webhooks` | when opening programmatic access to corporate clients |
| `saved_orders`, `favorites` | when "Reorder"/"Favorites" features (already listed in `features`) are implemented — simple `user_id/product_id` and `user_id/order_id` mapping tables |
| `legal_entities` | if the platform expands to multiple licensed operating entities per country |
| `industry_sectors`, `company_sizes` | lookup tables to normalize the currently free-text `companies.industry_sector`/`company_size` once reporting needs standardized values |
| `ingredients`, `allergens`, `nutrition_facts` | graduate out of `products.attributes` jsonb once nutrition/allergen data needs structured querying (e.g. "show all products without peanuts") |

---

## 18. Why Each Core Module Exists (quick-reference summary)

- **Companies/Documents/Addresses** → legally required GCC-style onboarding + verification gate before platform access.
- **Users/Roles/Permissions/Overrides/Policies** → RBAC today, ABAC-ready tomorrow, without redesign.
- **Features/Feature Flags/Visibility Rules** → Super Admin controls what each tenant can see/use, per-tenant, without code changes or deploys.
- **Navigation Menus** → sidebar is 100% database-driven, nested, per-company/role/user visibility.
- **Products/Categories/Variants/Options (PIM)** → centrally controlled catalog, enterprise PIM shape, future ERP/POS/nutrition-ready via jsonb + reserved reference columns.
- **Catalog Menus + Menu Assignments** → menu curation per company/department/user/campaign **without ever duplicating a product row**.
- **Business Rules Engine** → every "ordering rule"/"admin setting" is a data row, resolvable per scope with priority, not an if/else in code.
- **Company Configuration** → tenant branding/preferences, versioned independently from business logic rules.
- **Workflow Engine** → order (and future entity) statuses/transitions are fully data-defined, per company if needed, with SLA/escalation built in.
- **Orders module** → complete transactional core, with every "future_" item (invoice, payment, refund, driver, kitchen status) pre-scoped as a clean extension point.
- **Timeline** → single immutable append-only audit trail of *everything that happened*, independent of the generic `audit_logs` (which tracks *column-level* data changes) — timeline tracks *business events*.
- **Notifications** → channel-agnostic, template-driven.
- **Security tables** → sessions/tokens/OTP/login history separated from `users` for security hygiene and independent scaling/expiry.
- **Audit Logs** → single universal change-tracking table; no per-entity audit tables required, ever.

---

## 19. Future Integrations & Extensibility (schema-only — no integration is implemented)

Design goal: the platform runs **standalone today**. Nothing below is wired to any external system; it only guarantees that Odoo/SAP/Oracle/Dynamics/custom-ERP sync can be switched on later **without altering existing tables or breaking existing data**.

### 19.1 Why not add `odoo_product_id`, `odoo_sale_order_id`, etc. as literal columns

Doing so would (a) hardcode the schema to one ERP, (b) require a new column set for every future system (SAP, Oracle, Dynamics...), and (c) scatter sync metadata across many unrelated tables. Instead, one **generic, polymorphic external-mapping pattern** covers Odoo's requirements and any future system with zero additional columns on `products`, `orders`, `companies`, etc.

### 19.2 `external_systems` (lookup — not hardcoded)
| Column | Type | Notes |
|---|---|---|
| code | varchar(50) UNIQUE | `odoo, sap, oracle, dynamics, custom_erp_1, ...` — add a new system by inserting a row, not a migration |
| name | varchar(150) | |
| system_type | varchar(30) | `erp, pos, crm, accounting, other` |
| base_url | text NULL | integration endpoint, filled in only when actually connected |
| auth_config | jsonb NULL | connection credentials/config placeholder (encrypted at rest at the app layer) |
| is_active | boolean | whether this integration is currently switched on |

### 19.3 `external_system_mappings` (the single generic mapping table — replaces the need for Odoo-specific columns anywhere)

One row = "this local entity corresponds to that record in that external system."

| Column | Type | Notes |
|---|---|---|
| external_system_id | uuid FK → external_systems | |
| entity_type | varchar(50) | `product, product_variant, order, company, user, category, catalog_menu, ...` — generic, covers every major entity requested |
| entity_id | uuid | local row id (no FK constraint — deliberately polymorphic, mirrors the pattern already used by `timeline_events`/`audit_logs`) |
| external_id | varchar(150) | e.g. Odoo's numeric ID, SAP material number, etc. |
| external_secondary_id | varchar(150) NULL | covers cases needing two IDs at once, e.g. **Odoo Product Template ID** alongside **Odoo Variant ID**, or **Sale Order ID** alongside **Picking ID**/**Invoice ID** — see §19.4 for how multiple linked IDs per order are handled |
| external_reference_type | varchar(50) NULL | disambiguates what `external_id` represents when an entity needs more than one link, e.g. `sale_order, picking, invoice` all pointing at the same local `order_id` |
| external_sku | varchar(100) NULL | |
| sync_status | varchar(20) | `not_synced, pending, synced, failed, conflict` |
| sync_version | int | increments on every successful push/pull, enables optimistic sync conflict detection |
| sync_direction | varchar(20) | `outbound, inbound, bidirectional` |
| last_synced_at | timestamptz NULL | |
| last_sync_error | text NULL | |
| sync_attempts | int | default 0, supports retry/backoff logic |
| is_synced | boolean | convenience flag, derived from `sync_status = 'synced'` but kept as a column for fast filtering |
| created_from | varchar(20) | `local, external` — did this record originate in the platform or get pulled in from the ERP |
| updated_from | varchar(20) | `local, external` — which side made the most recent change |
| manual_override | boolean | default false — a human deliberately overrode the synced value; sync engine should not blindly overwrite it |
| has_local_changes | boolean | default false — local edits exist that haven't been pushed yet (future conflict-resolution trigger) |

**Unique:** `(external_system_id, entity_type, entity_id, external_reference_type)` — allows one local order to hold three linked mappings (`sale_order`, `picking`, `invoice`) against the same Odoo system simultaneously, exactly matching the requested Odoo Sale Order ID / Picking ID / Invoice ID trio, without any Odoo-specific columns.

**Indexes:** `(entity_type, entity_id)`; `(external_system_id, sync_status)` for "find everything pending sync to Odoo" worker queries.

### 19.4 How this satisfies every requested field, generically

| Requested (Odoo-specific wording) | Where it lives now |
|---|---|
| Odoo Product ID / Product Template ID / Variant ID | 3 rows in `external_system_mappings` for the same `entity_id`, differentiated by `external_reference_type` (`product`, `product_template`, `variant`) |
| External ERP ID / External SKU | `external_id` / `external_sku` columns — system-agnostic |
| Sync Status / Last Sync Date / Last Sync Error / Sync Version / Is Synced | direct columns on `external_system_mappings` |
| Odoo Sale Order ID / Picking ID / Invoice ID | 3 rows for the same `order.id`, `external_reference_type` = `sale_order` / `picking` / `invoice` |
| Sync Attempts | `sync_attempts` |

Because every field is scoped by `external_system_id`, the exact same `orders` or `products` row can simultaneously sync to **Odoo and SAP** later (e.g. during a migration between ERPs) with no schema change — just additional rows.

### 19.5 Integration readiness on every major entity (no columns added to business tables)

Rather than bolting `external_id/sync_status/...` onto `products`, `orders`, `companies`, `users`, `categories`, `catalog_menus` individually (which would mean six sets of nearly-identical nullable columns, and a seventh set for the next entity that needs it), **all six get their integration-readiness for free** simply by being a valid `entity_type` in `external_system_mappings`. This is the "prepare every major entity for future sync" requirement satisfied without touching a single existing business table — existing data is completely unaffected, matching the "without breaking existing data" principle.

If, later, a specific entity's sync needs genuinely outgrow the generic table (e.g. very high-frequency product price sync needing its own optimized path), that entity can graduate to dedicated columns via an additive migration — never a breaking one.

### 19.6 `integration_events` (append-only event log — schema only, no event bus implemented)

A generic outbox-style log capturing "things happened that an external system might care about." Background workers/integration services will later poll or subscribe to this table; nothing consumes it yet.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_code | varchar(100) | lookup-style, not enum — `product_created, product_updated, order_submitted, order_approved, order_cancelled, company_approved, ...` (extendable by inserting new event-producing code paths, no migration) |
| entity_type | varchar(50) | `product, order, company, user, category, catalog_menu, ...` |
| entity_id | uuid | |
| payload | jsonb | snapshot of the relevant data at event time |
| occurred_at | timestamptz | NOT NULL DEFAULT now() |
| target_system_id | uuid FK → external_systems, NULL | NULL = not yet routed to any specific system (generic event); once a worker claims it for a system, it's set |
| status | varchar(20) | `pending, processing, delivered, failed, skipped` |
| processed_at | timestamptz NULL | |
| retry_count | int | default 0 |
| last_error | text NULL | |
| correlation_id | uuid NULL | ties back to the originating `audit_logs`/`timeline_events` row for full traceability across all three logs |

**Design note — three distinct logs, three distinct purposes (no overlap/duplication):**
- `timeline_events` (§9) = human-facing business timeline ("what happened to this order")
- `audit_logs` (§12) = column-level data change history ("what field changed, old vs new value")
- `integration_events` (§19.6) = outbound sync/integration queue ("what does an external system need to know about")

**Indexes:** `(status, occurred_at)` for worker polling queries; `(entity_type, entity_id)`; BRIN on `occurred_at` (same high-volume append-only rationale as `timeline_events`).

---

## 20. Enterprise Feature Flags — Module-Level (extends §2A)

§2A already models individual `features` (fine-grained: Bulk Orders, Favorites, Reorder, Export Excel...). The new requirement is coarser: **whole modules** (Orders, Products, Categories, Reports, Notifications, Tracking, Analytics, Invoices, Payments, Support Tickets) toggled per company as a single switch, with individual features nested inside.

### 20.1 `modules` (lookup, not hardcoded)
| Column | Type | Notes |
|---|---|---|
| code | varchar(100) UNIQUE | `orders, products, categories, reports, notifications, tracking, analytics, bulk_orders, import_excel, export_excel, invoices, payments, support_tickets, ...` |
| name | varchar(150) | |
| description | text NULL | |
| is_core | boolean | core modules (e.g. Orders) may be non-disable-able for safety; enforced at app layer, not DB |
| sort_order | int | |

### 20.2 `features.module_id` (new FK added to the existing `features` table from §2A.1)
Every fine-grained feature now belongs to exactly one module: e.g. feature `export_excel` → module `export_excel` (a module can be a single feature, or a module can contain several features, e.g. module `orders` containing features `bulk_orders`, `reorder`, `saved_orders`).

### 20.3 `company_modules`
Mirrors `company_features` (§2A.3) but at the coarse module level — this is the switch the Super Admin flips to hide an entire section of the platform (and therefore its entire navigation subtree, per §21) for a company in one action.

| Column | Type | Notes |
|---|---|---|
| company_id | uuid FK | |
| module_id | uuid FK | |
| is_enabled | boolean | |
| enabled_from / enabled_until | timestamptz NULL | |

**Unique:** `(company_id, module_id)`.

**Resolution rule (app-layer, documented here for clarity):** a feature is actually available to a company only if **both** `company_modules.is_enabled = true` for its parent module **and** `company_features.is_enabled = true` for the feature itself — module OFF always wins regardless of the feature-level flag (module is the master switch).

### 20.4 Frontend delivery
`GET /me/modules` resolves `company_modules` ⋈ `features`/`company_features` into a single flat payload (`{"orders": true, "invoices": false, "bulk_orders": true, ...}`), cached per company with short TTL, invalidated on write — the frontend never hardcodes a module or feature name; it renders purely off this response.

---

## 21. Dynamic Dashboard — Extended (extends §2B)

§2B already covers a self-referencing, nested `navigation_menus` table with feature/permission dependency and per-scope overrides. The new requirements ask for an explicit **Pages/Routes** layer and explicit company/role/user assignment tables (rather than the single generic `navigation_menu_overrides`) — added here as a refinement, fully additive to §2B.

### 21.1 `menu_groups`
Top-level groupings shown as sidebar section headers (distinct from individual clickable items) — e.g. "Operations" grouping Orders/Products/Categories, "Insights" grouping Reports/Analytics.

| Column | Type |
|---|---|
| name | varchar(100) |
| icon | varchar(100) NULL |
| sort_order | int |
| is_enabled | boolean |

`navigation_menus.menu_group_id` — new nullable FK added to the existing §2B.1 table, linking each sidebar item to its group.

### 21.2 `pages`
Separates the abstract "page" concept from its navigation representation — a page can exist (and be permission/feature-gated) even before or without a sidebar entry pointing to it (e.g. a detail page reached only via drill-down, not directly in the sidebar).

| Column | Type | Notes |
|---|---|---|
| code | varchar(100) UNIQUE | `orders.list, orders.detail, products.catalog, reports.sales, ...` |
| name | varchar(150) | |
| module_id | uuid FK → modules, NULL | ties page availability to §20's module switch |

### 21.3 `routes`
| Column | Type | Notes |
|---|---|---|
| page_id | uuid FK | |
| path_template | varchar(255) | e.g. `/orders/:id`, supports future multi-region path prefixes (`/{locale}/orders/:id`) |
| http_method | varchar(10) | default `GET` — reserved for future API-permission cross-referencing |

`navigation_menus.page_id` — new nullable FK added to §2B.1, linking a sidebar item to the page it opens (if any; group headers have `page_id = NULL`).

### 21.4 `navigation_assignments` (replaces/extends the single `navigation_menu_overrides` from §2B.2 with explicit, queryable per-scope tables as requested)
| Column | Type | Notes |
|---|---|---|
| navigation_menu_id | uuid FK | |
| assignment_type | varchar(20) | `company, role, user` |
| assignment_target_id | uuid | company_id / role_id / user_id depending on type |
| is_visible | boolean | explicit show/hide, most specific (user) wins over role wins over company wins over the item's own default |

**Unique:** `(navigation_menu_id, assignment_type, assignment_target_id)`.

**Resolution order (most specific wins):** `navigation_assignments (user)` → `navigation_assignments (role)` → `navigation_assignments (company)` → `navigation_menus.is_enabled` default → `company_modules`/`company_features` gate (§20.3) → `required_permission_id` gate (§2B.1).

### 21.5 Full picture — every requested field, mapped

| Requested | Column/table |
|---|---|
| Navigation Menu / Menu Groups | `navigation_menus`, `menu_groups` |
| Sidebar Items | rows of `navigation_menus` |
| Pages / Routes | `pages`, `routes` |
| Icons | `navigation_menus.icon`, `menu_groups.icon` |
| Display Order | `navigation_menus.sort_order`, `menu_groups.sort_order` |
| Parent Menu | `navigation_menus.parent_id` (self-ref) |
| Visibility / Enable-Disable | `navigation_menus.is_enabled` + `navigation_assignments.is_visible` |
| Permission Requirement | `navigation_menus.required_permission_id` |
| Feature Requirement | `navigation_menus.feature_id` (+ module gate via `pages.module_id`) |
| Company / Role / User Assignment | `navigation_assignments` (`assignment_type` = company/role/user) |
| Future Custom Pages | new `pages` row + new `routes` row + new `navigation_menus` row — zero migrations |

---

## 22. Cross-Reference: Existing Tables Touched by This Addendum (additive only, no breaking changes)

| Existing table | New nullable FK/column added | Backward-compatible? |
|---|---|---|
| `features` (§2A.1) | `module_id` uuid FK → modules | Yes — nullable, existing rows unaffected until assigned a module |
| `navigation_menus` (§2B.1) | `menu_group_id`, `page_id` (both nullable FKs) | Yes |

No column is added to `products`, `orders`, `companies`, `users`, `categories`, or `catalog_menus` — their integration-readiness comes entirely from the generic `external_system_mappings`/`integration_events` tables (§19), leaving every existing table, index, and row completely untouched.

---

## 23. ⚠️ ARCHITECTURE REVISION — RBAC Applies ONLY to Internal Dashboard Users

**This section supersedes §2 (Users, Roles & Company Structure) and adjusts §2A, §2B, §20, §21 accordingly.** It is a breaking conceptual change, documented here explicitly rather than silently edited into earlier sections, so the reasoning and migration path are clear.

### 23.1 The two user types, and why they were unified before but shouldn't be

Previously (§2.1) a single `users` table served both company staff and platform staff, differentiated only by `user_type`. That was a reasonable simplification for authentication reuse, but it wrongly implied companies need a role/permission model. They don't:

| | **Company Accounts** (customers) | **Dashboard Users** (our own staff) |
|---|---|---|
| Purpose | Register a business, log in, place orders | Operate/administer the platform |
| Roles/Permissions? | **None** | **Full RBAC** |
| Examples | any company employee who logs in | Super Admin, Sales, Operations, Kitchen Manager, Customer Support, Finance, Marketing, Developer |
| Sees | Company Profile, Settings, Status, Documents, Delivery Addresses, Orders, Notifications — nothing else | Whatever pages/actions their role grants, dynamically |

### 23.2 `users` (§2.1) is deprecated — replaced by two distinct tables

#### `company_users` (replaces the "company" half of §2.1 — deliberately thin, no role/permission relation of any kind)
| Column | Type | Notes |
|---|---|---|
| company_id | uuid FK → companies | NOT NULL |
| full_name | varchar(150) | |
| email | citext UNIQUE | |
| mobile | varchar(30) UNIQUE NULL | |
| password_hash | text | |
| status | varchar(20) | `active, inactive, locked, invited` |
| is_primary_contact | boolean | default false — flags the main contact for the company; **not** a permission tier, purely informational |
| last_login_at | timestamptz NULL | |
| preferred_language | varchar(10) NULL | |

A company can still have multiple logins (as before), but **every login has identical access to that company's own data** — there is no admin/manager/employee/viewer distinction anymore. If a company genuinely needs "only some staff can submit orders above X," that is expressed later as a `business_rules` (§5) approval-threshold rule evaluated against `company_users.is_primary_contact` or a future simple flag — **not** as RBAC.

**What company_users can access (fixed, not permission-driven):** their own `companies` profile row, `company_addresses`, `company_documents`, `company_configurations` (settings), `orders` + related order sub-tables scoped to their `company_id`, and `notifications` addressed to them or their company. Nothing else exists to grant or deny — there's no page/permission surface to control on the company side, so no RBAC tables are needed for them at all.

#### `dashboard_users` (replaces the "platform" half of §2.1 — this is where all of §2's RBAC machinery now exclusively applies)
| Column | Type | Notes |
|---|---|---|
| full_name | varchar(150) | |
| email | citext UNIQUE | |
| password_hash | text | |
| status | varchar(20) | `active, inactive, locked, invited` |
| department | varchar(100) NULL | free text/lookup — Sales, Operations, Finance, Marketing, Support, Engineering — organizational only, **not** the same thing as `roles` |
| mfa_enabled | boolean | default false |
| last_login_at | timestamptz NULL | |

### 23.3 RBAC tables from §2 — now scoped exclusively to `dashboard_users`

`roles`, `permissions`, `permission_groups`, `role_permissions`, `role_inheritance`, `policies` (§2.3–2.10) are retained **unchanged in structure**, with one clarification: `roles.company_id` (previously nullable to allow "company-specific custom roles," §2.3) is now **removed** — roles are always platform-scoped, since companies no longer have roles at all.

#### `dashboard_user_roles` (replaces §2.7 `user_roles`)
| Column | Type |
|---|---|
| dashboard_user_id | uuid FK → dashboard_users |
| role_id | uuid FK → roles |
| assigned_by | uuid FK → dashboard_users |
| assigned_at | timestamptz |

#### `dashboard_user_company_assignments` (new — "Company Assignment (optional)")
Why: a Sales or Account Management dashboard user is often responsible for a specific subset of companies (their assigned accounts), without that being a permission — it's a data-scoping assignment layered on top of RBAC (e.g. "Sales role can view companies" + "this Sales user is assigned to these 40 companies" = sees only those 40).

| Column | Type | Notes |
|---|---|---|
| dashboard_user_id | uuid FK | |
| company_id | uuid FK | |
| assigned_at | timestamptz | |
| assigned_by | uuid FK → dashboard_users | |

**Unique:** `(dashboard_user_id, company_id)`. If a dashboard user has **zero** rows here, the app-layer convention is "sees all companies" (typical for Super Admin/Operations) — restriction only kicks in once at least one explicit assignment exists, avoiding a separate "scope_type = all" flag.

#### `dashboard_user_branch_assignments` (new — "Branch Assignment (future)", reserved now)
Same shape as above, pointed at a future `branches` entity (kitchen/production branches), for when the platform operates multiple physical kitchens and dashboard users like Kitchen Manager need scoping to their own branch.

| Column | Type |
|---|---|
| dashboard_user_id | uuid FK |
| branch_id | uuid | no FK yet — `branches` table doesn't exist yet; kept as a plain uuid placeholder column until that entity is built, avoiding a forward-reference to a non-existent table |
| assigned_at | timestamptz |

### 23.4 Dashboard Pages — consolidating §2B/§21 into the two-table shape you specified

Your suggested `DashboardPages` + `RolePagePermissions` shape is adopted directly as the canonical dashboard-navigation model, **consolidating** the earlier, more scattered §2B (`navigation_menus`) and §21 (`menu_groups`, `pages`, `routes`, `navigation_assignments`) into something simpler — since, per this revision, there is only ever one audience (dashboard users) needing dynamic navigation at all (companies get a fixed, small screen set with nothing to configure).

#### `dashboard_pages`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | varchar(150) | `Dashboard, Companies, Pending Companies, Products, Categories, Menus, Company Menu Assignment, Orders, Order Tracking, Reports, Analytics, Business Rules, Feature Flags, Settings, Audit Logs, Notifications, Support, ...` |
| route | varchar(255) | e.g. `/companies/pending` |
| icon | varchar(100) NULL | |
| parent_id | uuid FK → dashboard_pages.id, NULL | self-referencing, supports nested pages exactly like earlier `parent_id` pattern |
| sort_order | int | |
| module_id | uuid FK → modules (§20.1), NULL | ties page visibility to the module master-switch |
| feature_id | uuid FK → features (§2A.1), NULL | optional finer-grained feature dependency, e.g. "Odoo Sync" sub-page only if that feature is on |
| is_visible | boolean | default true — a "hidden" page still exists/works (deep-linkable) but is omitted from the rendered sidebar |
| is_enabled | boolean | default true — a fully disabled page (kill switch), distinct from merely hidden |

This single table replaces `navigation_menus` + `pages` + `routes` + `menu_groups` from §2B/§21 for the dashboard use case — `parent_id` doubles as both "group header" (a parent row with `route = NULL`) and "nested page," so no separate `menu_groups`/`routes` tables are needed once companies are out of scope for dynamic navigation.

**Note on §2B/§21:** treat those sections as **superseded** by `dashboard_pages` below; they are left in the document above for historical traceability of the reasoning, but any implementation should build against §23.4/§23.5, not §2B/§21.

#### `role_page_permissions` (adopted exactly as specified, extended with the additional actions you listed)
| Column | Type | Notes |
|---|---|---|
| role_id | uuid FK → roles | |
| page_id | uuid FK → dashboard_pages | |
| can_view | boolean | default false |
| can_create | boolean | default false |
| can_edit | boolean | default false |
| can_delete | boolean | default false |
| can_approve | boolean | default false |
| can_reject | boolean | default false |
| can_export | boolean | default false |
| can_import | boolean | default false |

**Unique:** `(role_id, page_id)`.

**Why boolean columns here instead of purely generic `permissions` rows:** these eight actions (View/Create/Edit/Delete/Approve/Reject/Export/Import) are universal CRUD-plus-workflow actions that apply, in the same shape, to almost every page — modeling them as fixed columns makes the single most common query ("can this role do X on page Y") a simple boolean read with no joins, which matters because this check runs on nearly every dashboard request.

### 23.5 The remaining, page-specific actions stay generic (genuinely "nothing hardcoded")

Your list also included actions that are **not** generic CRUD and don't fit cleanly as booleans on every page — `Assign Menu`, `Assign Products`, `Sync Odoo`, `Manage Rules`, `Manage Features`, `View Reports`, `Manage Companies`, `Manage Dashboard Users`. These stay exactly where §2.4's `permissions` table already puts them — one row per fine-grained action, joined through the existing `role_permissions` (§2.6), now understood to apply to `roles` in their dashboard-only sense:

```
permissions: order.assign_menu, product.assign_products, integration.sync_odoo,
             rules.manage, features.manage, reports.view, companies.manage,
             dashboard_users.manage, ...
```

**Resulting two-layer model (both layers scoped to dashboard_users/roles only):**
1. `role_page_permissions` → fast, page-scoped CRUD+workflow booleans (View/Create/Edit/Delete/Approve/Reject/Export/Import) for whichever `dashboard_pages` row the action happens on.
2. `role_permissions` (§2.6) → open-ended, code-based permissions for anything that isn't page-scoped CRUD (cross-cutting actions like "Sync Odoo," "Manage Feature Flags," or actions that don't correspond to a single page at all).

A dashboard user's effective capability = their role's row in `role_page_permissions` for the page they're on, **plus** whatever `role_permissions` codes their role(s) hold — checked together by the same authorization middleware. New action → new `permissions` row (or new boolean column only if it turns out to be as universal as the existing eight) — never a hardcoded `if` in application code.

### 23.6 Feature Flags — split by audience (Dashboard vs. Company), per this revision

`modules` (§20.1) and `features` (§2A.1) gain one new column:

| Column | Table | Notes |
|---|---|---|
| audience | `modules` | varchar(20) `dashboard, company` — every module belongs to exactly one audience now that the two user types are architecturally separate |

- **Company-audience modules/features** (Orders, Notifications, Tracking, Bulk Orders, Favorites, Reorder, Coupons...) continue to use the existing `company_modules`/`company_features` tables (§20.3/§2A.3) — enabled/disabled **per company**, exactly as already designed.
- **Dashboard-audience modules/features** (Reports, Analytics, Odoo Sync, Excel Import, Excel Export, Audit, Support Tickets — the internal-tooling side) use two new, structurally identical tables scoped by **role** instead of by company, since dashboard capability is an internal-org concern, not a tenant concern:

#### `dashboard_role_modules`
| Column | Type |
|---|---|
| role_id | uuid FK → roles |
| module_id | uuid FK → modules (audience = dashboard) |
| is_enabled | boolean |

#### `dashboard_role_features`
| Column | Type |
|---|---|
| role_id | uuid FK → roles |
| feature_id | uuid FK → features (audience = dashboard) |
| is_enabled | boolean |

A **global** on/off per dashboard feature (independent of any role — e.g. Super Admin flips "Odoo Sync" off platform-wide during a maintenance window) is still covered by the existing `feature_flags` table (§2A.4), which was already audience-agnostic and global by design.

### 23.7 Impact summary — what changes, what doesn't

| Item | Before (§2/§2A/§2B/§20/§21) | Now (§23) |
|---|---|---|
| `users` | one table, both audiences | **removed**, split into `company_users` + `dashboard_users` |
| `roles.company_id` | nullable, allowed per-company custom roles | **removed column** — roles are platform-only now |
| Company RBAC | companies had roles like Admin/Manager/Employee/Purchasing/Viewer | **removed entirely** — no roles/permissions for companies, full stop |
| `user_roles` | generic | renamed/replaced by `dashboard_user_roles` |
| Navigation for companies | shared `navigation_menus` model | **not needed** — companies get a fixed, small, non-configurable screen set (§23.2) |
| Navigation for dashboard | `navigation_menus`+`pages`+`routes`+`menu_groups`+`navigation_assignments` (§2B/§21) | consolidated into `dashboard_pages` + `role_page_permissions` (§23.4) |
| Action permissions | generic `permissions` only | hybrid: fast boolean CRUD via `role_page_permissions` + generic `permissions` for everything else (§23.5) |
| Feature flags | single `company_features`/`company_modules` | split by audience: company-scoped (unchanged) vs. role-scoped `dashboard_role_modules`/`dashboard_role_features` (§23.6) |
| Every other module (§3–§19, §22) | — | **unaffected** — Orders, PIM, Menu Assignment, Business Rules, Workflow Engine, Timeline, Notifications, Security, Audit, and Integration tables all still reference `company_id`/generic `entity_type+entity_id`/polymorphic actor patterns, and simply point `actor`/`created_by`/`updated_by`/`approver_id`-style columns at **either** `company_users.id` **or** `dashboard_users.id` depending on who performed the action — see §23.8 |

### 23.8 Actor references across the rest of the schema (necessary consequence of splitting `users` in two)

Every column across §1–§22 that previously referenced `users.id` (e.g. `companies.approved_by`, `orders.ordered_by_user_id`, `order_approvals.approver_id`, `order_notes.author_id`, `timeline_events.actor_id`, `audit_logs.changed_by`, `login_history.user_id`, `notifications.recipient_user_id`, session/token tables) must now indicate **which** of the two tables it points to, since there is no longer a single `users` table to reference. Two acceptable patterns — applied per column based on whether it can only ever be one type or genuinely either:

- **Single-type columns** (always one audience): FK directly to the correct table — e.g. `orders.ordered_by_user_id` → `company_users.id` (only a company user places an order), `dashboard_user_roles.assigned_by` → `dashboard_users.id` (only staff assign roles), `companies.approved_by` → `dashboard_users.id` (only staff approve companies).
- **Either-type columns** (genuinely both possible, e.g. `timeline_events.actor_id`, `audit_logs.changed_by`, `order_notes.author_id` where either a company user or a support agent might leave a note): add a companion `actor_type varchar(20)` (`company_user, dashboard_user, system`) column alongside the existing uuid column, and drop the FK constraint on that column (same polymorphic pattern already used for `entity_type`/`entity_id` throughout the document) — resolved at the application layer rather than the database layer.

This is a mechanical, additive change to a handful of already-nullable/polymorphic-style columns and does not require redesigning any of the tables in §3–§19.

---

## 24. Generic Approval Workflow Engine (schema only — no business logic implemented)

§7 already gives a generic state-machine (workflow/steps/transitions) for entity *status* (e.g. order preparing → ready → delivered). The new requirement is narrower and more specific: a reusable **multi-approver approval gate** pattern — "this entity needs sign-off from N people/roles before it proceeds" — needed today for company registration and orders, and for anything else later, without being the same thing as the full status state-machine.

**Relationship to §7:** an `approval_requests` row can be one of the *actions* a `workflow_transition` (§7.5, `workflow_actions.action_type = 'require_approval'`) triggers — the two engines compose rather than duplicate each other. Company registration approval (§1.4 `company_approval_history`) can now be modeled as an instance of this engine too, with `company_approval_history` retained as the lightweight append-only trail while `approval_requests`/`approval_decisions` carry the actual multi-step gate logic.

### 24.1 `approval_workflows`
A reusable approval **definition** for a given entity type — e.g. "Company Registration Approval," "Order Approval — High Value," "Order Approval — Standard."

| Column | Type | Notes |
|---|---|---|
| name | varchar(150) | |
| entity_type | varchar(50) | `company_registration, order, future_entity` — generic, not hardcoded |
| company_id | uuid FK NULL | NULL = platform-default workflow; set = company-specific override (mirrors §7.1's pattern) |
| is_active | boolean | |

### 24.2 `approval_workflow_steps`
Ordered gates within a workflow — supports sequential ("Manager, then Finance") and parallel ("any 2 of these 3 Directors") approval.

| Column | Type | Notes |
|---|---|---|
| approval_workflow_id | uuid FK | |
| step_order | int | |
| name | varchar(150) | e.g. "Finance Sign-off" |
| approver_type | varchar(20) | `role, dashboard_user, dynamic_rule` — who can act at this step |
| approver_role_id | uuid FK → roles, NULL | used when `approver_type = 'role'` (any dashboard user holding this role may decide) |
| approver_dashboard_user_id | uuid FK → dashboard_users, NULL | used when a specific named approver is required |
| approval_rule_id | uuid FK → business_rules (§5.2), NULL | used when `approver_type = 'dynamic_rule'` — e.g. "approver = requester's assigned account manager," resolved at runtime |
| required_approval_count | int | default 1 — supports "any 2 of N" parallel quorum approval |
| is_required | boolean | default true — a step can be conditionally skippable (e.g. only required above a value threshold, itself expressed as a `business_rules` condition referenced by `approval_rule_id`) |

### 24.3 `approval_requests`
One instance of an approval workflow being run against one entity.

| Column | Type | Notes |
|---|---|---|
| approval_workflow_id | uuid FK | |
| entity_type | varchar(50) | |
| entity_id | uuid | |
| status | varchar(20) | `pending, approved, rejected, cancelled` |
| current_step_order | int | |
| requested_by_type | varchar(20) | `company_user, dashboard_user, system` |
| requested_by_id | uuid | polymorphic, no FK constraint (same pattern as §23.8) |
| requested_at | timestamptz | |
| completed_at | timestamptz NULL | |

**Index:** `(entity_type, entity_id)`, `(status, current_step_order)`.

### 24.4 `approval_decisions` (append-only)
Every individual decision made at a step — supports the quorum case (`required_approval_count > 1`) where several people weigh in on the same step.

| Column | Type |
|---|---|
| approval_request_id | uuid FK |
| step_order | int |
| decided_by_type | varchar(20) `dashboard_user, company_user` |
| decided_by_id | uuid |
| decision | varchar(20) `approved, rejected` |
| comment | text NULL |
| decided_at | timestamptz |

---

## 25. Background Jobs Schema (schema only — no worker/queue implemented)

### 25.1 `background_jobs`
Generic async-task queue table — ERP sync, email/notification dispatch, imports, exports, and anything future, all as rows differentiated by `job_type`, never a dedicated table per job kind.

| Column | Type | Notes |
|---|---|---|
| job_type | varchar(100) | `erp_sync, send_email, send_notification, import_excel, export_excel, generate_report, ...` — lookup-style, extendable without migration |
| payload | jsonb | job-specific input parameters |
| status | varchar(20) | `pending, running, completed, failed, retrying, cancelled` |
| priority | smallint | default 0, higher = processed sooner |
| queue_name | varchar(50) | default `default` — supports future multi-queue routing (e.g. separate queue for heavy ERP syncs vs. quick emails) |
| scheduled_at | timestamptz | when it should first be attempted (supports "run later," not just "run now") |
| started_at | timestamptz NULL | |
| completed_at | timestamptz NULL | |
| retry_count | int | default 0 |
| max_retries | int | default 3 |
| last_error | text NULL | |
| correlation_id | uuid NULL | ties back to the `audit_logs`/`integration_events` row that triggered the job |
| created_by_type | varchar(20) NULL | `dashboard_user, system` |
| created_by_id | uuid NULL | polymorphic, no FK |

**Indexes:** `(status, priority DESC, scheduled_at)` — the exact shape a worker's "claim next job" query needs; BRIN on `scheduled_at`.

### 25.2 `job_schedules`
Recurring/cron-style jobs (e.g. "nightly Odoo full sync," "weekly report email") — separate from one-off `background_jobs` rows, which this table generates on each run.

| Column | Type | Notes |
|---|---|---|
| job_type | varchar(100) | |
| cron_expression | varchar(100) | standard cron syntax |
| default_payload | jsonb | |
| is_active | boolean | |
| last_run_at | timestamptz NULL | |
| next_run_at | timestamptz NULL | |

### 25.3 `job_execution_logs` (append-only)
Per-attempt history — a single `background_jobs` row can be attempted multiple times (retries); each attempt gets its own log row here rather than overwriting the parent.

| Column | Type |
|---|---|
| background_job_id | uuid FK |
| attempt_number | int |
| started_at | timestamptz |
| finished_at | timestamptz NULL |
| status | varchar(20) `success, failure` |
| output | jsonb NULL |
| error_message | text NULL |

---

## 26. Centralized File Management (supersedes ad-hoc `*_document_id` columns and per-entity attachment tables)

Every file reference introduced earlier (`companies.logo_document_id`, `company_documents`, `order_attachments`, future invoice PDFs, product media) is consolidated into one storage table plus one generic attachment/mapping table, rather than each business entity owning its own file columns or its own attachment table.

### 26.1 `files`
The single record of an uploaded/stored file, regardless of what it's attached to.

| Column | Type | Notes |
|---|---|---|
| file_name | varchar(255) | original filename |
| storage_key | text | path/key in the storage backend (S3 key, blob path, etc.) |
| storage_provider | varchar(30) | `s3, azure_blob, local, ...` — not hardcoded to one provider |
| url | text | public/signed URL, or NULL if access must always be brokered |
| mime_type | varchar(100) | |
| size_bytes | bigint | |
| checksum | varchar(128) NULL | dedup/integrity verification |
| uploaded_by_type | varchar(20) | `company_user, dashboard_user, system` |
| uploaded_by_id | uuid NULL | polymorphic, no FK |
| is_public | boolean | default false |

### 26.2 `file_attachments` (generic polymorphic mapping — replaces `company_documents`, `order_attachments`, and every `*_document_id` FK column)
| Column | Type | Notes |
|---|---|---|
| file_id | uuid FK → files | |
| entity_type | varchar(50) | `company, product, order, invoice, category, dashboard_user, ...` — any current or future entity |
| entity_id | uuid | polymorphic, no FK constraint (consistent with every other polymorphic pattern in this document) |
| attachment_type | varchar(50) | `logo, trade_license, commercial_registration, tax_certificate, order_attachment, invoice_pdf, product_image, delivery_proof, ...` — lookup-style, replaces the need for a differently-named column/table per document category |
| sort_order | int | default 0 — ordering when an entity has multiple files of the same type (e.g. several order attachments) |
| caption | varchar(255) NULL | |
| expiry_date | date NULL | retained from §1.2's original `company_documents.expiry_date` need (trade license/tax cert expiry) |
| verification_status | varchar(30) NULL | `pending, verified, rejected` — retained from §1.2, now generic to any attachment that needs verification, not just company documents |
| verified_by | uuid FK → dashboard_users, NULL | |
| verified_at | timestamptz NULL | |

**Index:** `(entity_type, entity_id, attachment_type)`.

**Migration note:** §1.2 (`company_documents`), §8.6 (`order_attachments`), and every `*_document_id`/`*_media` style column referenced elsewhere in this document (`companies.logo_document_id`, `product_media`, `order_delivery_details.delivery_proof_document_id`, etc.) are superseded by `files` + `file_attachments`. `product_media` (§3.4) is the one exception kept as a dedicated table rather than folded in here, since product images specifically need `is_primary`/product-specific ordering semantics tightly coupled to the PIM display logic — everything else consolidates cleanly.

---

## 27. Global Settings & Company Settings Override Architecture

§6 (`company_configurations`) already gives per-company, versioned settings. What was missing is an explicit **global default layer** those company rows override — added now as its own table plus a documented resolution order, so "override per company" is a real, queryable fallback chain rather than an implicit convention.

### 27.1 `global_settings`
The platform-wide default for every configurable key — always exactly one active row per key.

| Column | Type | Notes |
|---|---|---|
| setting_key | varchar(150) UNIQUE | same key namespace as `company_configurations.config_key` (§6.1), e.g. `theme.primary_color`, `ordering.default_vat_rate`, `notification.order_confirmation.channel` |
| setting_value | jsonb | the platform default |
| is_overridable | boolean | default true — a small number of settings (e.g. platform-level compliance flags) can be locked so no company override is permitted, enforced at the app layer using this flag |
| description | text NULL | |
| updated_by | uuid FK → dashboard_users, NULL | |
| updated_at | timestamptz | |

### 27.2 `global_settings_history` (append-only, mirrors §6.2's pattern for company config)
| Column | Type |
|---|---|
| setting_key | varchar(150) |
| setting_value | jsonb |
| changed_by | uuid FK → dashboard_users |
| changed_at | timestamptz |

### 27.3 Resolution order (documented contract between the two layers, enforced at the app/read layer, not the DB)

```
resolve(company_id, setting_key):
    1. look up company_configurations WHERE company_id = X AND config_key = setting_key AND is_active = true
       → if found, return it (company override wins)
    2. else look up global_settings WHERE setting_key = setting_key
       → return the platform default
    3. if neither exists, the key is genuinely undefined — application-level error, not a silent default
```

This makes §6's existing table the "override" layer and §27.1 the "default" layer of one coherent system, rather than two unrelated settings mechanisms — no change required to §6's structure, only the addition of §27.1/27.2 and this documented contract.

---

## 28. Localization / Multilingual Support (Arabic + English now, extendable to any future language)

### 28.1 `languages` (lookup — not hardcoded to `ar`/`en`)
| Column | Type | Notes |
|---|---|---|
| code | varchar(10) UNIQUE | `ar, en, fr, ...` (ISO 639-1, extended if needed) |
| name | varchar(100) | |
| native_name | varchar(100) | e.g. "العربية" |
| is_rtl | boolean | drives frontend text-direction, essential for Arabic |
| is_active | boolean | |
| is_default | boolean | exactly one row true (partial unique index) |

Every `language_code`/`preferred_language` column introduced earlier in this document (`companies.default_language`, `company_users.preferred_language`, `product_translations.language_code`, `notification_templates.language_code`) now formally references `languages.code` instead of being a bare free-text column — additive FK, no structural change.

### 28.2 Generic `translations` table (default pattern for most entities)
Rather than a dedicated `*_translations` table per entity (which was reasonable for `products` alone at §3.3's scale, but doesn't scale to *every* user-facing entity — categories, `catalog_menus`, `dashboard_pages` names, `notification_templates`, `modules`/`features` display names, `menu_groups`, etc.), a single generic polymorphic table covers all of them.

| Column | Type | Notes |
|---|---|---|
| entity_type | varchar(50) | `category, catalog_menu, dashboard_page, notification_template, module, feature, menu_group, ...` |
| entity_id | uuid | polymorphic, no FK |
| field_name | varchar(100) | which column this translates, e.g. `name`, `description` |
| language_code | varchar(10) FK → languages | |
| translated_value | text | |

**Unique:** `(entity_type, entity_id, field_name, language_code)`.

### 28.3 Why `products` keeps its dedicated `product_translations` (§3.3) rather than migrating into §28.2

Product name/description translation is queried on every single catalog listing request — high enough volume and performance sensitivity to justify its own indexed table with real columns (`name`, `description`) instead of a generic `field_name` string match. This is a deliberate, documented exception: **high-traffic, high-volume entities keep dedicated translation tables; everything else uses the generic `translations` table** (§28.2). If any other entity's translation traffic grows enough to matter later, it can graduate the same way `products` already has — an additive change, not a breaking one.

### 28.4 What this does *not* do (explicitly out of scope, per "schema only, no business logic")

No fallback logic, no automatic translation, no per-request language negotiation is implemented here — only the tables needed so the application layer can build that behavior later: given a `language_code`, look up `translations` (or `product_translations`), and fall back to `languages.is_default` when a specific translation row is missing.

---

## 29. Architecture Correction — Internal RBAC Confirmed Primary; Company Users Formalized as a Dormant Future Extension

This section refines §23 on two points: (a) makes the internal dashboard user → company assignment model fully explicit rather than relying on an implicit "no rows = all companies" convention, and (b) formally prepares — but does not activate — a future RBAC layer for company users.

### 29.1 Confirmation: no change to the core split

Everything in §23 stands: `dashboard_users` is the sole owner of `roles`/`permissions`/`role_page_permissions`/`role_permissions`; `dashboard_users` operate the Internal Admin Dashboard (Dynamic Dashboard, Feature Flags, Business Rules Management, Company Management, Order Management, Reports, Analytics, Odoo/ERP Integrations, Audit Logs — all already modeled in §2, §2A, §5, §19, §20, §23.4/23.5); `company_users` (§23.2) remain flat, undifferentiated logins limited to Register/Login/Company Profile/Browse Menus/Orders/Order Tracking/History/Notifications. This section only adds precision to the company-assignment model and the future extension — it does not reopen either of those decisions.

### 29.2 Refined company-assignment model for internal users (replaces the implicit convention in §23.3)

§23.3's `dashboard_user_company_assignments` worked, but relying on "zero assignment rows means sees all companies" is an implicit rule baked into application logic rather than a queryable fact — fragile if a user's assignment set is ever emptied by mistake, and it silently changes meaning (from "assigned to nothing" to "assigned to everything"). Replaced with an explicit scope declaration:

#### `dashboard_user_company_scope` (new — one row per dashboard user)
| Column | Type | Notes |
|---|---|---|
| dashboard_user_id | uuid FK → dashboard_users, UNIQUE | one scope declaration per user |
| scope_type | varchar(20) | `all, specific` — explicit, not inferred |
| updated_by | uuid FK → dashboard_users | |
| updated_at | timestamptz | |

#### `dashboard_user_company_assignments` (unchanged shape from §23.3, but now meaningful **only** when the user's scope is `specific`)
| Column | Type |
|---|---|
| dashboard_user_id | uuid FK |
| company_id | uuid FK |
| assigned_at | timestamptz |
| assigned_by | uuid FK → dashboard_users |

**Resolution (explicit, no implicit convention):**
```
resolve_visible_companies(dashboard_user_id):
    scope = dashboard_user_company_scope WHERE dashboard_user_id = X
    if scope.scope_type == 'all':  return ALL companies
    if scope.scope_type == 'specific': return companies FROM dashboard_user_company_assignments WHERE dashboard_user_id = X
```
Matches every example given — Operations → {A, B, C} and Sales → {D} are `scope_type = 'specific'` rows with corresponding `dashboard_user_company_assignments`; Super Admin → all companies is `scope_type = 'all'` with **zero** rows in the assignments table, but that's now a stated fact (`scope_type`) rather than an inferred one. Adding a company to an "all"-scope user requires no change at all (they already see everything); narrowing a user from "all" to "specific" is a single `scope_type` update plus inserting the relevant assignment rows — no ambiguity at any point. `dashboard_user_branch_assignments` (§23.3) is left as-is; the same explicit-scope refinement can be applied to it later, when `branches` exists as a real entity.

### 29.3 Future Company Users Module — dormant, feature-gated, zero impact on the current MVP

Per "prepare the schema... without requiring major database changes" and "no business logic should depend on Company Users today," a parallel, deliberately separate RBAC-shaped structure is added now, entirely inert until switched on:

#### `company_roles`
Mirrors `roles` (§2.3) in shape, but is a **separate table in its own namespace** — never joined with the internal `roles`/`permissions` tables, so activating this later cannot collide with or complicate internal RBAC.

| Column | Type | Notes |
|---|---|---|
| company_id | uuid FK NULL | NULL = system-provided template role usable by any company (e.g. seed rows for "Purchasing Manager," "HR," "Reception," "Restaurant Manager"); non-NULL = a company's own custom role, once/if that's allowed |
| name | varchar(100) | |
| is_system_role | boolean | |

#### `company_permissions`
Separate namespace from the internal `permissions` (§2.4) — company-side actions only, e.g. `order.create`, `order.approve`, `menu.browse`. Kept intentionally small; there is no requirement to mirror the full internal permission surface.

| Column | Type |
|---|---|
| code | varchar(150) UNIQUE |
| name | varchar(150) |
| description | text NULL |

#### `company_role_permissions`
| Column | Type |
|---|---|
| company_role_id | uuid FK |
| company_permission_id | uuid FK |
| effect | varchar(10) `allow, deny` |

#### `company_user_roles`
The only new relationship touching the existing `company_users` table — and it's a join table, so **`company_users` itself gains no new column** and its current flat behavior is completely unaffected until rows exist here and the feature below is enabled.

| Column | Type |
|---|---|
| company_user_id | uuid FK → company_users |
| company_role_id | uuid FK → company_roles |
| assigned_by | uuid FK → dashboard_users | only internal staff can enable this per company, consistent with §29.1 |
| assigned_at | timestamptz |

### 29.4 How this stays fully inert until deliberately activated

- A `features` (§2A.1) row, `code = 'company_user_roles'`, `audience = 'company'` (§23.6), with `is_global_default_enabled = false`, gates the entire module. Until a given company's `company_features` entry for it is switched on, the application layer never queries `company_roles`/`company_permissions`/`company_user_roles` for that company, and every `company_user` continues to behave exactly as §23.2 describes: full, undifferentiated access to their own company's data.
- No existing table (`company_users`, `roles`, `permissions`, `role_permissions`, `dashboard_user_roles`) is altered — this is a purely additive set of four new tables plus one feature flag row, satisfying "without requiring major database changes."
- When the module is eventually switched on for a company, enabling per-user differentiation (Purchasing Manager can order but not approve, Reception can only view, etc.) becomes a matter of inserting `company_user_roles`/`company_role_permissions` rows — no schema change at activation time either.

---

## 30. ⚠️ FINAL ERRATA PASS — Read This Section Before Implementing Anything

Sections §1–§29 are a chronological design log, including sections that explicitly supersede earlier ones (§23 supersedes parts of §2/§2A/§2B/§20/§21; §29 refines §23). That structure is useful for understanding *why* the model is shaped this way, but it also means a literal top-to-bottom read leaves a handful of dangling references and duplicate tables that were never individually patched when `users` was split into `company_users`/`dashboard_users`. This section is the single, final correction pass. **`prisma/schema.prisma` implements this section, not the raw §1–§29 text where the two disagree.**

### 30.1 Global fix: every `created_by`/`updated_by` (Auditable block) is polymorphic, never a bare FK to `users`

`users` no longer exists as a table (§23.2). §0.2 has been corrected in place to `created_by_type`/`created_by_id`/`updated_by_type`/`updated_by_id` (no FK). This applies to **every single table in this document that carries the Auditable block** — there is no table-by-table exception. Resolve the actor in the application/service layer exactly like every other `entity_type`/`entity_id` polymorphic pair.

### 30.2 Table-specific actor/user columns that need the same polymorphic or re-pointed treatment

These are columns *outside* the generic Auditable block (i.e., named things like `actor_id`, `approver_id`, `changed_by`) that were written when a single `users` table existed. Per §23.8's own stated principle ("single-type → re-point the FK; either-type → add a companion `*_type` column and drop the FK"), here is the exhaustive, resolved list:

| Table.column | Original (stale) | Final (implement this) |
|---|---|---|
| `company_approval_history.actor_id` | FK → `users` | FK → `dashboard_users.id` (single-type — only staff decide company approvals) |
| `entity_workflow_history.actor_id` | FK → `users`, NULL | `actor_type varchar(20)` (`company_user`\|`dashboard_user`\|`system`) + `actor_id uuid` NULL, no FK (either-type: a company user can cancel their own order, a dashboard user can force a transition, the SLA job can auto-transition) |
| `order_notes.author_id` | FK → `users` | `author_type varchar(20)` (`company_user`\|`dashboard_user`) + `author_id uuid`, no FK |
| `order_approvals.approver_id` | FK → `users` | `approver_type varchar(20)` (`company_user`\|`dashboard_user`) + `approver_id uuid`, no FK (a company's own `is_primary_contact` user can approve their team's orders; a dashboard user can approve high-value/escalated orders — both are legal approvers depending on the resolved `approval_workflow_steps.approver_type`, §24.2) |
| `order_cancellations.cancelled_by` | FK → `users` | `cancelled_by_type varchar(20)` (`company_user`\|`dashboard_user`\|`system`) + `cancelled_by_id uuid`, no FK |
| `notifications.recipient_user_id` | FK → `users`, NULL | `recipient_type varchar(20)` (`company_user`\|`dashboard_user`) + `recipient_id uuid`, NULL, no FK — kept alongside the existing `recipient_company_id` for broadcasts |
| `device_tokens.user_id` | FK → `users` | `owner_type varchar(20)` (`company_user`\|`dashboard_user`) + `owner_id uuid`, no FK |
| `company_configuration_history.changed_by` | FK → `users` | `changed_by_type varchar(20)` (`company_user`\|`dashboard_user`) + `changed_by_id uuid`, no FK (a company can edit its own preferences; staff can also override on their behalf) |
| `user_sessions.user_id` | FK → `users` | `actor_type varchar(20)` (`company_user`\|`dashboard_user`) + `actor_id uuid`, no FK — **or**, equally valid and slightly simpler to index/query, split into two physically separate tables `company_user_sessions` / `dashboard_user_sessions` with a real FK each. Either is acceptable; pick one and apply it consistently to all four tables below. `prisma/schema.prisma` uses the **two-table split** because it lets each table keep a real, indexed FK (cheaper lookups, cleaner cascade-on-delete) instead of an unenforceable polymorphic pair, and session/token tables are never queried across both audiences at once anyway. |
| `refresh_tokens.user_id` | FK → `users` | Same choice as above → `company_user_refresh_tokens` / `dashboard_user_refresh_tokens` |
| `login_history.user_id` | FK → `users`, NULL | Same choice as above → `company_user_login_history` / `dashboard_user_login_history` (still append-only, still keeps `attempted_email` for the "unknown email" case) |
| `password_reset_tokens.user_id` | FK → `users` | Same choice as above → `company_user_password_reset_tokens` / `dashboard_user_password_reset_tokens` |
| `otp_codes.user_id` | FK → `users`, NULL | Same choice as above → `company_user_otp_codes` / `dashboard_user_otp_codes` (registration OTP for a brand-new company user who has no row yet keeps `user_id` NULL and relies on `destination`, exactly as originally designed) |
| `audit_logs.changed_by` | FK → `users`, NULL | `changed_by_type varchar(20)` (`company_user`\|`dashboard_user`\|`system`) + `changed_by_id uuid`, NULL, no FK (already flagged as an example in §23.8 — restated here as authoritative) |

Columns **already correctly polymorphic or correctly single-typed in the original text** (no change needed, listed here only so nothing is missed during implementation): `orders.ordered_by_user_id` (→ `company_users.id`), `dashboard_user_roles.assigned_by`/`dashboard_user_company_assignments.assigned_by`/`dashboard_user_company_scope.updated_by`/`company_user_roles.assigned_by` (→ `dashboard_users.id`), `companies.approved_by` (→ `dashboard_users.id`), `file_attachments.verified_by` (→ `dashboard_users.id`), `global_settings.updated_by`/`global_settings_history.changed_by` (→ `dashboard_users.id`), `files.uploaded_by_type`/`uploaded_by_id` (§26.1), `background_jobs.created_by_type`/`created_by_id` (§25.1), `approval_requests.requested_by_type`/`requested_by_id` and `approval_decisions.decided_by_type`/`decided_by_id` (§24.3/24.4), `timeline_events.actor_id`/`actor_role` (§9.1 — upgrade `actor_id` to the same `actor_type`+`actor_id` no-FK pair; `actor_role` stays as a denormalized display string).

### 30.3 RBAC-adjacent tables narrowed after §23 removed company-side permissions

Two tables from §2 were written *before* §23 removed the entire concept of a company having roles/permissions, and were never narrowed afterward:

- **`permission_overrides.scope_type`** (§2.9): drop the `company` option. Since `company_users` have no permission-relevant context at all (§23.2), a per-company permission exception is meaningless. Final: `scope_type` ∈ `{ dashboard_user }` only, `scope_id` → `dashboard_users.id`. (The dormant future `company_role_permissions`, §29.3, is the correct place for any future company-side exception once/if that module is activated — it deliberately does not reuse this table.)
- **`policies.applies_to`** (§2.10): drop the `company` option for the same reason. Final: `applies_to` ∈ `{ role, dashboard_user }`, `target_id` → `roles.id` or `dashboard_users.id` respectively.

### 30.4 `visibility_rules` (§2A.5) scope after navigation was superseded

`visibility_rules.target_type` originally included `navigation_item`, which is superseded by `dashboard_pages` + `role_page_permissions` (§23.4) — `dashboard_pages` already has its own `is_visible`/`is_enabled`/`module_id`/`feature_id` gates and does not need this generic table. Final: `target_type` ∈ `{ feature, menu, product }` (drop `navigation_item`). When `scope_type = 'user'`, add a companion `scope_actor_type varchar(20)` (`company_user`\|`dashboard_user`) since a feature/menu visibility rule could target either audience.

### 30.5 Tables to implement vs. tables to skip entirely (deduplication after §23/§26 supersessions)

The document explicitly supersedes some of its own earlier tables in later sections. Building **both** the old and new version is a real risk if §1–§22 are read in isolation. Do **not** create the "superseded" tables — they exist in the document only for historical traceability of the design reasoning.

| Superseded (do NOT implement) | Superseded by | Where the document says so |
|---|---|---|
| `users` (§2.1) | `company_users` + `dashboard_users` | §23.2 |
| `user_roles` (§2.7) | `dashboard_user_roles` | §23.2 |
| `roles.company_id` (§2.3) | *(column removed — `roles` is always platform-scoped)* | §23.3 |
| `navigation_menus`, `navigation_menu_overrides` (§2B) | `dashboard_pages` + `role_page_permissions` | §23.4 |
| `menu_groups`, `pages`, `routes`, `navigation_assignments` (§21) | `dashboard_pages` + `role_page_permissions` | §23.4, §23.5 |
| `company_documents` (§1.2) | `files` + `file_attachments` (`entity_type='company'`, `attachment_type` = `trade_license`\|`commercial_registration`\|`tax_certificate`\|`logo`\|`authorization_letter`\|`bank_letter`\|`other`) | §26.2 migration note |
| `order_attachments` (§8.6) | `files` + `file_attachments` (`entity_type='order'`, `attachment_type='order_attachment'`) | §26.2 migration note |
| `companies.logo_document_id` column | `file_attachments` (`entity_type='company'`, `attachment_type='logo'`) | §26.2 migration note |
| `categories.image_document_id`, `order_delivery_details.delivery_proof_document_id` columns | `file_attachments` (`attachment_type='category_image'` / `'delivery_proof'` respectively) | §26.2 migration note (same generalization) |

Every other table in §1–§29 **is** part of the final model, including the intentionally-dormant, not-yet-activated ones (`policies`, `feature_flags`, `dashboard_user_branch_assignments`, `company_roles`/`company_permissions`/`company_role_permissions`/`company_user_roles`, the `invoices`/`payments`/`refunds`/`driver_assignments`/`kitchen_statuses` names reserved in §8.10/§17 are **not** part of v1 and are correctly excluded — only build them when their owning feature is actually scoped).

### 30.6 Where to find the compiled result

`prisma/schema.prisma` (sibling to this file) is the literal Prisma implementation of §1–§29 **with every correction in §30.1–§30.5 already applied** — every model, every field, every enum, every `@@unique`/`@@index`, and every polymorphic pair is there in compilable form. Treat a mismatch between prose and Prisma file as a bug in whichever one is wrong, not as two valid alternatives.
