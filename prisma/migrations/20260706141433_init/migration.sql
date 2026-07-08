-- CreateEnum
CREATE TYPE "company_status" AS ENUM ('pending', 'active', 'suspended', 'blocked', 'closed');

-- CreateEnum
CREATE TYPE "approval_status" AS ENUM ('pending', 'under_review', 'approved', 'rejected', 'resubmission_required');

-- CreateEnum
CREATE TYPE "document_verification_status" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "fulfillment_type" AS ENUM ('delivery', 'pickup');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "legal_name" VARCHAR(255) NOT NULL,
    "trade_name" VARCHAR(255),
    "commercial_registration_no" VARCHAR(100),
    "tax_registration_no" VARCHAR(100),
    "national_address_no" VARCHAR(100),
    "industry_sector" VARCHAR(150),
    "company_size" VARCHAR(50),
    "country_code" CHAR(2) NOT NULL,
    "city" VARCHAR(100),
    "primary_contact_name" VARCHAR(150),
    "primary_contact_title" VARCHAR(100),
    "primary_email" VARCHAR(255) NOT NULL,
    "primary_phone" VARCHAR(30) NOT NULL,
    "secondary_phone" VARCHAR(30),
    "website" VARCHAR(255),
    "default_currency" CHAR(3) NOT NULL,
    "default_timezone" VARCHAR(64) NOT NULL,
    "default_language_code" VARCHAR(10),
    "status" "company_status" NOT NULL DEFAULT 'pending',
    "approval_status" "approval_status" NOT NULL DEFAULT 'pending',
    "approval_notes" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "onboarding_source" VARCHAR(50),
    "parent_company_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "address_type" VARCHAR(20) NOT NULL,
    "label" VARCHAR(100),
    "address_line1" VARCHAR(255),
    "address_line2" VARCHAR(255),
    "city" VARCHAR(100),
    "state_province" VARCHAR(100),
    "country_code" VARCHAR(2),
    "postal_code" VARCHAR(20),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "contact_name" VARCHAR(150),
    "contact_phone" VARCHAR(30),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "company_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_approval_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30) NOT NULL,
    "actor_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_approval_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "department_id" UUID,
    "full_name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "mobile" VARCHAR(30),
    "password_hash" TEXT NOT NULL,
    "password_algo" VARCHAR(20) NOT NULL DEFAULT 'bcrypt',
    "status" VARCHAR(20) NOT NULL DEFAULT 'invited',
    "is_primary_contact" BOOLEAN NOT NULL DEFAULT false,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(6),
    "preferred_language_code" VARCHAR(10),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "company_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_algo" VARCHAR(20) NOT NULL DEFAULT 'bcrypt',
    "status" VARCHAR(20) NOT NULL DEFAULT 'invited',
    "department" VARCHAR(100),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "dashboard_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "cost_center_code" VARCHAR(50),
    "parent_department_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "scope" VARCHAR(20) NOT NULL DEFAULT 'platform',
    "is_system_role" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(150) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "permission_group_id" UUID,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "permission_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "effect" VARCHAR(10) NOT NULL DEFAULT 'allow',

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "dashboard_user_roles" (
    "dashboard_user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_by" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_user_roles_pkey" PRIMARY KEY ("dashboard_user_id","role_id")
);

-- CreateTable
CREATE TABLE "role_inheritance" (
    "parent_role_id" UUID NOT NULL,
    "child_role_id" UUID NOT NULL,

    CONSTRAINT "role_inheritance_pkey" PRIMARY KEY ("parent_role_id","child_role_id")
);

-- CreateTable
CREATE TABLE "permission_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope_type" VARCHAR(20) NOT NULL DEFAULT 'dashboard_user',
    "scope_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "effect" VARCHAR(10) NOT NULL,
    "reason" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "role_unused_id" UUID,

    CONSTRAINT "permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "effect" VARCHAR(10) NOT NULL,
    "conditions" JSONB NOT NULL,
    "applies_to" VARCHAR(20) NOT NULL,
    "target_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_user_company_scope" (
    "dashboard_user_id" UUID NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL DEFAULT 'specific',
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dashboard_user_company_scope_pkey" PRIMARY KEY ("dashboard_user_id")
);

-- CreateTable
CREATE TABLE "dashboard_user_company_assignments" (
    "dashboard_user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "assigned_by" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_user_company_assignments_pkey" PRIMARY KEY ("dashboard_user_id","company_id")
);

-- CreateTable
CREATE TABLE "dashboard_user_branch_assignments" (
    "dashboard_user_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_user_branch_assignments_pkey" PRIMARY KEY ("dashboard_user_id","branch_id")
);

-- CreateTable
CREATE TABLE "features" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "feature_group_id" UUID,
    "module_id" UUID,
    "description" TEXT,
    "is_global_default_enabled" BOOLEAN NOT NULL DEFAULT false,
    "requires_permission_id" UUID,

    CONSTRAINT "features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "feature_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_features" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "feature_id" UUID NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabled_from" TIMESTAMPTZ(6),
    "enabled_until" TIMESTAMPTZ(6),
    "config" JSONB,

    CONSTRAINT "company_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "is_enabled_globally" BOOLEAN NOT NULL DEFAULT false,
    "rollout_percentage" INTEGER NOT NULL DEFAULT 0,
    "environment" VARCHAR(20) NOT NULL DEFAULT 'all',
    "targeting_rules" JSONB,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visibility_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" UUID NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL,
    "scope_id" UUID NOT NULL,
    "scope_actor_type" VARCHAR(20),
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMPTZ(6),
    "effective_to" TIMESTAMPTZ(6),

    CONSTRAINT "visibility_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "is_core" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "audience" VARCHAR(20) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabled_from" TIMESTAMPTZ(6),
    "enabled_until" TIMESTAMPTZ(6),

    CONSTRAINT "company_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_role_modules" (
    "role_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "dashboard_role_modules_pkey" PRIMARY KEY ("role_id","module_id")
);

-- CreateTable
CREATE TABLE "dashboard_role_features" (
    "role_id" UUID NOT NULL,
    "feature_id" UUID NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "dashboard_role_features_pkey" PRIMARY KEY ("role_id","feature_id")
);

-- CreateTable
CREATE TABLE "dashboard_pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "route" VARCHAR(255) NOT NULL,
    "icon" VARCHAR(100),
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "module_id" UUID,
    "feature_id" UUID,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "dashboard_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_page_permissions" (
    "role_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT false,
    "can_create" BOOLEAN NOT NULL DEFAULT false,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,
    "can_delete" BOOLEAN NOT NULL DEFAULT false,
    "can_approve" BOOLEAN NOT NULL DEFAULT false,
    "can_reject" BOOLEAN NOT NULL DEFAULT false,
    "can_export" BOOLEAN NOT NULL DEFAULT false,
    "can_import" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "role_page_permissions_pkey" PRIMARY KEY ("role_id","page_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_category_id" UUID,
    "name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "sku" VARCHAR(100),
    "barcode" VARCHAR(100),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "base_price" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "tax_class" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'public',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "erp_reference_id" VARCHAR(100),
    "pos_reference_id" VARCHAR(100),
    "search_metadata" JSONB,
    "attributes" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_translations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "language_code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,

    CONSTRAINT "product_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "media_type" VARCHAR(20) NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "variant_name" VARCHAR(150) NOT NULL,
    "sku" VARCHAR(100),
    "price_adjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_option_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "selection_type" VARCHAR(20) NOT NULL DEFAULT 'single',
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "is_required" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "option_group_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "price_adjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_availability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "day_of_week" SMALLINT,
    "start_time" TIME(0),
    "end_time" TIME(0),
    "available_from" DATE,
    "available_to" DATE,

    CONSTRAINT "product_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_tags" (
    "product_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "product_tags_pkey" PRIMARY KEY ("product_id","tag_id")
);

-- CreateTable
CREATE TABLE "product_pricing_lists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_pricing_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pricing_list_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "price" DECIMAL(12,2) NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(6),

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_pricing_list_assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "pricing_list_id" UUID NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(6),

    CONSTRAINT "company_pricing_list_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_menus" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "menu_type" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "catalog_menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_menu_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "catalog_menu_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catalog_menu_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_menu_products" (
    "catalog_menu_section_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "catalog_menu_products_pkey" PRIMARY KEY ("catalog_menu_section_id","product_id")
);

-- CreateTable
CREATE TABLE "menu_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "catalog_menu_id" UUID NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL,
    "scope_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "menu_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "value_schema" JSONB,

    CONSTRAINT "rule_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rule_type_id" UUID NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL,
    "scope_id" UUID,
    "value" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "business_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendars" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "country_code" VARCHAR(2),
    "company_id" UUID,

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "calendar_id" UUID NOT NULL,
    "event_date" DATE NOT NULL,
    "event_type" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_configurations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "config_key" VARCHAR(150) NOT NULL,
    "config_value" JSONB NOT NULL,
    "config_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "company_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_configuration_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "config_key" VARCHAR(150) NOT NULL,
    "config_value" JSONB NOT NULL,
    "config_version" INTEGER NOT NULL,
    "changed_by_type" VARCHAR(20),
    "changed_by_id" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_configuration_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "workflow_type" VARCHAR(30) NOT NULL,
    "company_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "step_type" VARCHAR(20) NOT NULL,
    "sla_minutes" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_transitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_id" UUID NOT NULL,
    "from_step_id" UUID,
    "to_step_id" UUID NOT NULL,
    "trigger_type" VARCHAR(20) NOT NULL,
    "required_permission_id" UUID,

    CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_conditions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_transition_id" UUID NOT NULL,
    "condition_expression" JSONB NOT NULL,

    CONSTRAINT "workflow_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_step_id" UUID NOT NULL,
    "action_type" VARCHAR(30) NOT NULL,
    "action_config" JSONB NOT NULL,

    CONSTRAINT "workflow_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_workflow_instances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "current_step_id" UUID NOT NULL,
    "entered_step_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sla_due_at" TIMESTAMPTZ(6),

    CONSTRAINT "entity_workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_workflow_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_instance_id" UUID NOT NULL,
    "from_step_id" UUID,
    "to_step_id" UUID NOT NULL,
    "actor_type" VARCHAR(20),
    "actor_id" UUID,
    "transitioned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,

    CONSTRAINT "entity_workflow_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "department_id" UUID,
    "ordered_by_user_id" UUID NOT NULL,
    "order_number" VARCHAR(50) NOT NULL,
    "workflow_instance_id" UUID,
    "currency" CHAR(3) NOT NULL,
    "subtotal_amount" DECIMAL(14,2) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "service_charge_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "delivery_fee_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "requested_delivery_at" TIMESTAMPTZ(6) NOT NULL,
    "delivery_address_id" UUID,
    "fulfillment_type" "fulfillment_type" NOT NULL,
    "coupon_id" UUID,
    "source_channel" VARCHAR(20) NOT NULL DEFAULT 'web',
    "is_bulk_order" BOOLEAN NOT NULL DEFAULT false,
    "parent_order_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "product_name_snapshot" VARCHAR(255) NOT NULL,
    "unit_price_snapshot" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_item_id" UUID NOT NULL,
    "product_option_id" UUID NOT NULL,
    "price_adjustment_snapshot" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "order_item_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "status_code" VARCHAR(50) NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "author_type" VARCHAR(20) NOT NULL,
    "author_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "approver_type" VARCHAR(20) NOT NULL,
    "approver_id" UUID NOT NULL,
    "approval_level" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "decided_at" TIMESTAMPTZ(6),
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_delivery_details" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "driver_name" VARCHAR(150),
    "driver_phone" VARCHAR(30),
    "vehicle_info" VARCHAR(150),
    "tracking_reference" VARCHAR(100),
    "delivered_at" TIMESTAMPTZ(6),

    CONSTRAINT "order_delivery_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_cancellations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "cancelled_by_type" VARCHAR(20),
    "cancelled_by_id" UUID,
    "reason_code" VARCHAR(50),
    "reason_text" TEXT,
    "cancelled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "event_code" VARCHAR(100) NOT NULL,
    "actor_type" VARCHAR(20),
    "actor_id" UUID,
    "actor_role" VARCHAR(100),
    "source" VARCHAR(30) NOT NULL DEFAULT 'system',
    "device_info" VARCHAR(255),
    "ip_address" VARCHAR(45),
    "geo_location" JSONB,
    "comment" TEXT,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "subject_template" TEXT,
    "body_template" TEXT NOT NULL,
    "language_code" VARCHAR(10) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID,
    "channel" VARCHAR(20) NOT NULL,
    "recipient_type" VARCHAR(20),
    "recipient_id" UUID,
    "recipient_company_id" UUID,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'queued',
    "sent_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "related_entity_type" VARCHAR(50),
    "related_entity_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_type" VARCHAR(20) NOT NULL,
    "owner_id" UUID NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_user_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_user_id" UUID NOT NULL,
    "session_token_hash" TEXT NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "company_user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_user_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dashboard_user_id" UUID NOT NULL,
    "session_token_hash" TEXT NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "dashboard_user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_user_refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by_token_id" UUID,

    CONSTRAINT "company_user_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_user_refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dashboard_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by_token_id" UUID,

    CONSTRAINT "dashboard_user_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_user_login_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_user_id" UUID,
    "attempted_email" VARCHAR(255) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "failure_reason" VARCHAR(100),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_user_login_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_user_login_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dashboard_user_id" UUID,
    "attempted_email" VARCHAR(255) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "failure_reason" VARCHAR(100),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_user_login_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_user_password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "company_user_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_user_password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dashboard_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "dashboard_user_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_user_otp_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_user_id" UUID,
    "destination" VARCHAR(255) NOT NULL,
    "purpose" VARCHAR(30) NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "attempt_count" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "company_user_otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_user_otp_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dashboard_user_id" UUID,
    "destination" VARCHAR(255) NOT NULL,
    "purpose" VARCHAR(30) NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "attempt_count" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "dashboard_user_otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_name" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "changed_fields" JSONB,
    "changed_by_type" VARCHAR(20),
    "changed_by_id" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "source" VARCHAR(30) NOT NULL,
    "correlation_id" UUID NOT NULL,
    "request_id" UUID,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_systems" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "system_type" VARCHAR(30) NOT NULL,
    "base_url" TEXT,
    "auth_config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "external_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_system_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_system_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "external_id" VARCHAR(150) NOT NULL,
    "external_secondary_id" VARCHAR(150),
    "external_reference_type" VARCHAR(50),
    "external_sku" VARCHAR(100),
    "sync_status" VARCHAR(20) NOT NULL DEFAULT 'not_synced',
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_direction" VARCHAR(20) NOT NULL DEFAULT 'outbound',
    "last_synced_at" TIMESTAMPTZ(6),
    "last_sync_error" TEXT,
    "sync_attempts" INTEGER NOT NULL DEFAULT 0,
    "is_synced" BOOLEAN NOT NULL DEFAULT false,
    "created_from" VARCHAR(20) NOT NULL DEFAULT 'local',
    "updated_from" VARCHAR(20) NOT NULL DEFAULT 'local',
    "manual_override" BOOLEAN NOT NULL DEFAULT false,
    "has_local_changes" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "external_system_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_code" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "target_system_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "processed_at" TIMESTAMPTZ(6),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "correlation_id" UUID,

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "company_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflow_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "approval_workflow_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "approver_type" VARCHAR(20) NOT NULL,
    "approver_role_id" UUID,
    "approver_dashboard_user_id" UUID,
    "approval_rule_id" UUID,
    "required_approval_count" INTEGER NOT NULL DEFAULT 1,
    "is_required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "approval_workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "approval_workflow_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "current_step_order" INTEGER NOT NULL DEFAULT 1,
    "requested_by_type" VARCHAR(20) NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "approval_request_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "decided_by_type" VARCHAR(20) NOT NULL,
    "decided_by_id" UUID NOT NULL,
    "decision" VARCHAR(20) NOT NULL,
    "comment" TEXT,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "queue_name" VARCHAR(50) NOT NULL DEFAULT 'default',
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "correlation_id" UUID,
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_type" VARCHAR(100) NOT NULL,
    "cron_expression" VARCHAR(100) NOT NULL,
    "default_payload" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMPTZ(6),
    "next_run_at" TIMESTAMPTZ(6),

    CONSTRAINT "job_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_execution_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "background_job_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "status" VARCHAR(20) NOT NULL,
    "output" JSONB,
    "error_message" TEXT,

    CONSTRAINT "job_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "file_name" VARCHAR(255) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "storage_provider" VARCHAR(30) NOT NULL,
    "url" TEXT,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" VARCHAR(128),
    "uploaded_by_type" VARCHAR(20) NOT NULL,
    "uploaded_by_id" UUID,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "file_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "attachment_type" VARCHAR(50) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "caption" VARCHAR(255),
    "expiry_date" DATE,
    "verification_status" VARCHAR(30),
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "file_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "setting_key" VARCHAR(150) NOT NULL,
    "setting_value" JSONB NOT NULL,
    "is_overridable" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "global_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_settings_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "setting_key" VARCHAR(150) NOT NULL,
    "setting_value" JSONB NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_settings_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "languages" (
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "native_name" VARCHAR(100) NOT NULL,
    "is_rtl" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "translations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "field_name" VARCHAR(100) NOT NULL,
    "language_code" VARCHAR(10) NOT NULL,
    "translated_value" TEXT NOT NULL,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "is_system_role" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "company_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(150) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,

    CONSTRAINT "company_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_role_permissions" (
    "company_role_id" UUID NOT NULL,
    "company_permission_id" UUID NOT NULL,
    "effect" VARCHAR(10) NOT NULL DEFAULT 'allow',

    CONSTRAINT "company_role_permissions_pkey" PRIMARY KEY ("company_role_id","company_permission_id")
);

-- CreateTable
CREATE TABLE "company_user_roles" (
    "company_user_id" UUID NOT NULL,
    "company_role_id" UUID NOT NULL,
    "assigned_by" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_user_roles_pkey" PRIMARY KEY ("company_user_id","company_role_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_commercial_registration_no_key" ON "companies"("commercial_registration_no");

-- CreateIndex
CREATE UNIQUE INDEX "companies_tax_registration_no_key" ON "companies"("tax_registration_no");

-- CreateIndex
CREATE INDEX "companies_status_idx" ON "companies"("status");

-- CreateIndex
CREATE INDEX "companies_approval_status_idx" ON "companies"("approval_status");

-- CreateIndex
CREATE INDEX "company_addresses_company_id_idx" ON "company_addresses"("company_id");

-- CreateIndex
CREATE INDEX "company_approval_history_company_id_idx" ON "company_approval_history"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_users_email_key" ON "company_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "company_users_mobile_key" ON "company_users"("mobile");

-- CreateIndex
CREATE INDEX "company_users_company_id_idx" ON "company_users"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_users_email_key" ON "dashboard_users"("email");

-- CreateIndex
CREATE INDEX "departments_company_id_idx" ON "departments"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permission_overrides_scope_type_scope_id_idx" ON "permission_overrides"("scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "policies_applies_to_target_id_idx" ON "policies"("applies_to", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "features_code_key" ON "features"("code");

-- CreateIndex
CREATE UNIQUE INDEX "company_features_company_id_feature_id_key" ON "company_features"("company_id", "feature_id");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "visibility_rules_target_type_target_id_idx" ON "visibility_rules"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "visibility_rules_scope_type_scope_id_idx" ON "visibility_rules"("scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "modules_code_key" ON "modules"("code");

-- CreateIndex
CREATE UNIQUE INDEX "company_modules_company_id_module_id_key" ON "company_modules"("company_id", "module_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_translations_product_id_language_code_key" ON "product_translations"("product_id", "language_code");

-- CreateIndex
CREATE INDEX "product_media_product_id_idx" ON "product_media"("product_id");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_option_groups_product_id_idx" ON "product_option_groups"("product_id");

-- CreateIndex
CREATE INDEX "product_options_option_group_id_idx" ON "product_options"("option_group_id");

-- CreateIndex
CREATE INDEX "product_availability_product_id_idx" ON "product_availability"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "product_prices_pricing_list_id_product_id_idx" ON "product_prices"("pricing_list_id", "product_id");

-- CreateIndex
CREATE INDEX "company_pricing_list_assignment_company_id_idx" ON "company_pricing_list_assignment"("company_id");

-- CreateIndex
CREATE INDEX "catalog_menu_sections_catalog_menu_id_idx" ON "catalog_menu_sections"("catalog_menu_id");

-- CreateIndex
CREATE INDEX "menu_assignments_scope_type_scope_id_is_active_idx" ON "menu_assignments"("scope_type", "scope_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "rule_types_code_key" ON "rule_types"("code");

-- CreateIndex
CREATE INDEX "business_rules_rule_type_id_scope_type_scope_id_idx" ON "business_rules"("rule_type_id", "scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "calendar_events_calendar_id_event_date_idx" ON "calendar_events"("calendar_id", "event_date");

-- CreateIndex
CREATE INDEX "company_configuration_history_company_id_config_key_idx" ON "company_configuration_history"("company_id", "config_key");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_workflow_id_code_key" ON "workflow_steps"("workflow_id", "code");

-- CreateIndex
CREATE INDEX "entity_workflow_instances_entity_type_entity_id_idx" ON "entity_workflow_instances"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "entity_workflow_history_workflow_instance_id_idx" ON "entity_workflow_history"("workflow_instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_workflow_instance_id_key" ON "orders"("workflow_instance_id");

-- CreateIndex
CREATE INDEX "orders_company_id_created_at_idx" ON "orders"("company_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_idx" ON "order_status_history"("order_id");

-- CreateIndex
CREATE INDEX "order_notes_order_id_idx" ON "order_notes"("order_id");

-- CreateIndex
CREATE INDEX "order_approvals_order_id_idx" ON "order_approvals"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_delivery_details_order_id_key" ON "order_delivery_details"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_cancellations_order_id_key" ON "order_cancellations"("order_id");

-- CreateIndex
CREATE INDEX "timeline_events_entity_type_entity_id_occurred_at_idx" ON "timeline_events"("entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "timeline_events_event_code_idx" ON "timeline_events"("event_code");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_code_channel_language_code_key" ON "notification_templates"("code", "channel", "language_code");

-- CreateIndex
CREATE INDEX "notifications_recipient_type_recipient_id_idx" ON "notifications"("recipient_type", "recipient_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_company_id_idx" ON "notifications"("recipient_company_id");

-- CreateIndex
CREATE INDEX "device_tokens_owner_type_owner_id_idx" ON "device_tokens"("owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "company_user_sessions_company_user_id_idx" ON "company_user_sessions"("company_user_id");

-- CreateIndex
CREATE INDEX "dashboard_user_sessions_dashboard_user_id_idx" ON "dashboard_user_sessions"("dashboard_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_user_refresh_tokens_token_hash_key" ON "company_user_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "company_user_refresh_tokens_company_user_id_idx" ON "company_user_refresh_tokens"("company_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_user_refresh_tokens_token_hash_key" ON "dashboard_user_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "dashboard_user_refresh_tokens_dashboard_user_id_idx" ON "dashboard_user_refresh_tokens"("dashboard_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_user_password_reset_tokens_token_hash_key" ON "company_user_password_reset_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_user_password_reset_tokens_token_hash_key" ON "dashboard_user_password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "audit_logs_entity_name_entity_id_changed_at_idx" ON "audit_logs"("entity_name", "entity_id", "changed_at");

-- CreateIndex
CREATE INDEX "audit_logs_correlation_id_idx" ON "audit_logs"("correlation_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_systems_code_key" ON "external_systems"("code");

-- CreateIndex
CREATE INDEX "external_system_mappings_entity_type_entity_id_idx" ON "external_system_mappings"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "external_system_mappings_external_system_id_sync_status_idx" ON "external_system_mappings"("external_system_id", "sync_status");

-- CreateIndex
CREATE UNIQUE INDEX "external_system_mappings_external_system_id_entity_type_ent_key" ON "external_system_mappings"("external_system_id", "entity_type", "entity_id", "external_reference_type");

-- CreateIndex
CREATE INDEX "integration_events_status_occurred_at_idx" ON "integration_events"("status", "occurred_at");

-- CreateIndex
CREATE INDEX "integration_events_entity_type_entity_id_idx" ON "integration_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "approval_workflow_steps_approval_workflow_id_step_order_idx" ON "approval_workflow_steps"("approval_workflow_id", "step_order");

-- CreateIndex
CREATE INDEX "approval_requests_entity_type_entity_id_idx" ON "approval_requests"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "approval_requests_status_current_step_order_idx" ON "approval_requests"("status", "current_step_order");

-- CreateIndex
CREATE INDEX "approval_decisions_approval_request_id_idx" ON "approval_decisions"("approval_request_id");

-- CreateIndex
CREATE INDEX "background_jobs_status_priority_scheduled_at_idx" ON "background_jobs"("status", "priority" DESC, "scheduled_at");

-- CreateIndex
CREATE INDEX "job_execution_logs_background_job_id_idx" ON "job_execution_logs"("background_job_id");

-- CreateIndex
CREATE INDEX "file_attachments_entity_type_entity_id_attachment_type_idx" ON "file_attachments"("entity_type", "entity_id", "attachment_type");

-- CreateIndex
CREATE UNIQUE INDEX "global_settings_setting_key_key" ON "global_settings"("setting_key");

-- CreateIndex
CREATE INDEX "global_settings_history_setting_key_idx" ON "global_settings_history"("setting_key");

-- CreateIndex
CREATE UNIQUE INDEX "translations_entity_type_entity_id_field_name_language_code_key" ON "translations"("entity_type", "entity_id", "field_name", "language_code");

-- CreateIndex
CREATE UNIQUE INDEX "company_permissions_code_key" ON "company_permissions"("code");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_default_language_code_fkey" FOREIGN KEY ("default_language_code") REFERENCES "languages"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_parent_company_id_fkey" FOREIGN KEY ("parent_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_addresses" ADD CONSTRAINT "company_addresses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_approval_history" ADD CONSTRAINT "company_approval_history_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_approval_history" ADD CONSTRAINT "company_approval_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_preferred_language_code_fkey" FOREIGN KEY ("preferred_language_code") REFERENCES "languages"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_department_id_fkey" FOREIGN KEY ("parent_department_id") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_permission_group_id_fkey" FOREIGN KEY ("permission_group_id") REFERENCES "permission_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_user_roles" ADD CONSTRAINT "dashboard_user_roles_dashboard_user_id_fkey" FOREIGN KEY ("dashboard_user_id") REFERENCES "dashboard_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_user_roles" ADD CONSTRAINT "dashboard_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_user_roles" ADD CONSTRAINT "dashboard_user_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_inheritance" ADD CONSTRAINT "role_inheritance_parent_role_id_fkey" FOREIGN KEY ("parent_role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_inheritance" ADD CONSTRAINT "role_inheritance_child_role_id_fkey" FOREIGN KEY ("child_role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_scope_dashboard_user_fkey" FOREIGN KEY ("scope_id") REFERENCES "dashboard_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_role_unused_id_fkey" FOREIGN KEY ("role_unused_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_target_role_fkey" FOREIGN KEY ("target_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_target_dashboard_user_fkey" FOREIGN KEY ("target_id") REFERENCES "dashboard_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_user_company_scope" ADD CONSTRAINT "dashboard_user_company_scope_dashboard_user_id_fkey" FOREIGN KEY ("dashboard_user_id") REFERENCES "dashboard_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_user_company_scope" ADD CONSTRAINT "dashboard_user_company_scope_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_user_company_assignments" ADD CONSTRAINT "dashboard_user_company_assignments_dashboard_user_id_fkey" FOREIGN KEY ("dashboard_user_id") REFERENCES "dashboard_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_user_company_assignments" ADD CONSTRAINT "dashboard_user_company_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_user_company_assignments" ADD CONSTRAINT "dashboard_user_company_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_user_branch_assignments" ADD CONSTRAINT "dashboard_user_branch_assignments_dashboard_user_id_fkey" FOREIGN KEY ("dashboard_user_id") REFERENCES "dashboard_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "features" ADD CONSTRAINT "features_feature_group_id_fkey" FOREIGN KEY ("feature_group_id") REFERENCES "feature_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "features" ADD CONSTRAINT "features_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "features" ADD CONSTRAINT "features_requires_permission_id_fkey" FOREIGN KEY ("requires_permission_id") REFERENCES "permissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_features" ADD CONSTRAINT "company_features_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_features" ADD CONSTRAINT "company_features_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_modules" ADD CONSTRAINT "company_modules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_modules" ADD CONSTRAINT "company_modules_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_role_modules" ADD CONSTRAINT "dashboard_role_modules_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_role_modules" ADD CONSTRAINT "dashboard_role_modules_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_role_features" ADD CONSTRAINT "dashboard_role_features_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_role_features" ADD CONSTRAINT "dashboard_role_features_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_pages" ADD CONSTRAINT "dashboard_pages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "dashboard_pages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dashboard_pages" ADD CONSTRAINT "dashboard_pages_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_pages" ADD CONSTRAINT "dashboard_pages_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "features"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_page_permissions" ADD CONSTRAINT "role_page_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_page_permissions" ADD CONSTRAINT "role_page_permissions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "dashboard_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_language_code_fkey" FOREIGN KEY ("language_code") REFERENCES "languages"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_groups" ADD CONSTRAINT "product_option_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_option_group_id_fkey" FOREIGN KEY ("option_group_id") REFERENCES "product_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_availability" ADD CONSTRAINT "product_availability_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_pricing_list_id_fkey" FOREIGN KEY ("pricing_list_id") REFERENCES "product_pricing_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_pricing_list_assignment" ADD CONSTRAINT "company_pricing_list_assignment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_pricing_list_assignment" ADD CONSTRAINT "company_pricing_list_assignment_pricing_list_id_fkey" FOREIGN KEY ("pricing_list_id") REFERENCES "product_pricing_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_menu_sections" ADD CONSTRAINT "catalog_menu_sections_catalog_menu_id_fkey" FOREIGN KEY ("catalog_menu_id") REFERENCES "catalog_menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_menu_products" ADD CONSTRAINT "catalog_menu_products_catalog_menu_section_id_fkey" FOREIGN KEY ("catalog_menu_section_id") REFERENCES "catalog_menu_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_menu_products" ADD CONSTRAINT "catalog_menu_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_assignments" ADD CONSTRAINT "menu_assignments_catalog_menu_id_fkey" FOREIGN KEY ("catalog_menu_id") REFERENCES "catalog_menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_rule_type_id_fkey" FOREIGN KEY ("rule_type_id") REFERENCES "rule_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_configurations" ADD CONSTRAINT "company_configurations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_from_step_id_fkey" FOREIGN KEY ("from_step_id") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_to_step_id_fkey" FOREIGN KEY ("to_step_id") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_required_permission_id_fkey" FOREIGN KEY ("required_permission_id") REFERENCES "permissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_conditions" ADD CONSTRAINT "workflow_conditions_workflow_transition_id_fkey" FOREIGN KEY ("workflow_transition_id") REFERENCES "workflow_transitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_actions" ADD CONSTRAINT "workflow_actions_workflow_step_id_fkey" FOREIGN KEY ("workflow_step_id") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_workflow_instances" ADD CONSTRAINT "entity_workflow_instances_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_workflow_instances" ADD CONSTRAINT "entity_workflow_instances_current_step_id_fkey" FOREIGN KEY ("current_step_id") REFERENCES "workflow_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_workflow_history" ADD CONSTRAINT "entity_workflow_history_workflow_instance_id_fkey" FOREIGN KEY ("workflow_instance_id") REFERENCES "entity_workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_ordered_by_user_id_fkey" FOREIGN KEY ("ordered_by_user_id") REFERENCES "company_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_workflow_instance_id_fkey" FOREIGN KEY ("workflow_instance_id") REFERENCES "entity_workflow_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_fkey" FOREIGN KEY ("delivery_address_id") REFERENCES "company_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_parent_order_id_fkey" FOREIGN KEY ("parent_order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_product_option_id_fkey" FOREIGN KEY ("product_option_id") REFERENCES "product_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_approvals" ADD CONSTRAINT "order_approvals_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_delivery_details" ADD CONSTRAINT "order_delivery_details_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_cancellations" ADD CONSTRAINT "order_cancellations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_language_code_fkey" FOREIGN KEY ("language_code") REFERENCES "languages"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user_sessions" ADD CONSTRAINT "company_user_sessions_company_user_id_fkey" FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_user_sessions" ADD CONSTRAINT "dashboard_user_sessions_dashboard_user_id_fkey" FOREIGN KEY ("dashboard_user_id") REFERENCES "dashboard_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user_refresh_tokens" ADD CONSTRAINT "company_user_refresh_tokens_company_user_id_fkey" FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user_refresh_tokens" ADD CONSTRAINT "company_user_refresh_tokens_replaced_by_token_id_fkey" FOREIGN KEY ("replaced_by_token_id") REFERENCES "company_user_refresh_tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dashboard_user_refresh_tokens" ADD CONSTRAINT "dashboard_user_refresh_tokens_dashboard_user_id_fkey" FOREIGN KEY ("dashboard_user_id") REFERENCES "dashboard_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_user_refresh_tokens" ADD CONSTRAINT "dashboard_user_refresh_tokens_replaced_by_token_id_fkey" FOREIGN KEY ("replaced_by_token_id") REFERENCES "dashboard_user_refresh_tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "company_user_login_history" ADD CONSTRAINT "company_user_login_history_company_user_id_fkey" FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_user_login_history" ADD CONSTRAINT "dashboard_user_login_history_dashboard_user_id_fkey" FOREIGN KEY ("dashboard_user_id") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user_password_reset_tokens" ADD CONSTRAINT "company_user_password_reset_tokens_company_user_id_fkey" FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_user_password_reset_tokens" ADD CONSTRAINT "dashboard_user_password_reset_tokens_dashboard_user_id_fkey" FOREIGN KEY ("dashboard_user_id") REFERENCES "dashboard_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user_otp_codes" ADD CONSTRAINT "company_user_otp_codes_company_user_id_fkey" FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_user_otp_codes" ADD CONSTRAINT "dashboard_user_otp_codes_dashboard_user_id_fkey" FOREIGN KEY ("dashboard_user_id") REFERENCES "dashboard_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_system_mappings" ADD CONSTRAINT "external_system_mappings_external_system_id_fkey" FOREIGN KEY ("external_system_id") REFERENCES "external_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_target_system_id_fkey" FOREIGN KEY ("target_system_id") REFERENCES "external_systems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflow_steps" ADD CONSTRAINT "approval_workflow_steps_approval_workflow_id_fkey" FOREIGN KEY ("approval_workflow_id") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflow_steps" ADD CONSTRAINT "approval_workflow_steps_approver_role_id_fkey" FOREIGN KEY ("approver_role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflow_steps" ADD CONSTRAINT "approval_workflow_steps_approver_dashboard_user_id_fkey" FOREIGN KEY ("approver_dashboard_user_id") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflow_steps" ADD CONSTRAINT "approval_workflow_steps_approval_rule_id_fkey" FOREIGN KEY ("approval_rule_id") REFERENCES "business_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_approval_workflow_id_fkey" FOREIGN KEY ("approval_workflow_id") REFERENCES "approval_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_execution_logs" ADD CONSTRAINT "job_execution_logs_background_job_id_fkey" FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global_settings" ADD CONSTRAINT "global_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global_settings_history" ADD CONSTRAINT "global_settings_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_roles" ADD CONSTRAINT "company_roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_role_permissions" ADD CONSTRAINT "company_role_permissions_company_role_id_fkey" FOREIGN KEY ("company_role_id") REFERENCES "company_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_role_permissions" ADD CONSTRAINT "company_role_permissions_company_permission_id_fkey" FOREIGN KEY ("company_permission_id") REFERENCES "company_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user_roles" ADD CONSTRAINT "company_user_roles_company_user_id_fkey" FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user_roles" ADD CONSTRAINT "company_user_roles_company_role_id_fkey" FOREIGN KEY ("company_role_id") REFERENCES "company_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user_roles" ADD CONSTRAINT "company_user_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
