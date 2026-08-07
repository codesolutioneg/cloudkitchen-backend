-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(60),
    "name" VARCHAR(180) NOT NULL,
    "name_ar" VARCHAR(180),
    "contact_name" VARCHAR(150),
    "phone" VARCHAR(40),
    "email" VARCHAR(180),
    "notes" TEXT,
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

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "name_ar" VARCHAR(150),
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

    CONSTRAINT "ingredient_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ingredient_category_id" UUID,
    "supplier_id" UUID,
    "sku" VARCHAR(100),
    "name" VARCHAR(180) NOT NULL,
    "name_ar" VARCHAR(180),
    "dimension" VARCHAR(10) NOT NULL,
    "base_uom" VARCHAR(10) NOT NULL,
    "purchase_price" DECIMAL(12,4) NOT NULL,
    "purchase_qty" DECIMAL(14,4) NOT NULL,
    "purchase_uom" VARCHAR(20) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "yield_percent" DECIMAL(6,3) NOT NULL DEFAULT 100.000,
    "cost_per_base_unit" DECIMAL(18,8) NOT NULL,
    "cost_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
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

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_uom_conversions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ingredient_id" UUID NOT NULL,
    "from_uom" VARCHAR(20) NOT NULL,
    "to_uom" VARCHAR(20) NOT NULL,
    "factor" DECIMAL(18,8) NOT NULL,
    "note" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,

    CONSTRAINT "ingredient_uom_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_price_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ingredient_id" UUID NOT NULL,
    "batch_id" UUID,
    "old_purchase_price" DECIMAL(12,4),
    "new_purchase_price" DECIMAL(12,4) NOT NULL,
    "old_purchase_qty" DECIMAL(14,4),
    "new_purchase_qty" DECIMAL(14,4) NOT NULL,
    "purchase_uom" VARCHAR(20) NOT NULL,
    "old_yield_percent" DECIMAL(6,3),
    "new_yield_percent" DECIMAL(6,3) NOT NULL,
    "old_cost_per_base_unit" DECIMAL(18,8),
    "new_cost_per_base_unit" DECIMAL(18,8) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "change_percent" DECIMAL(10,4),
    "change_reason" VARCHAR(30) NOT NULL,
    "note" TEXT,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_type" VARCHAR(20),
    "changed_by_id" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredient_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_price_update_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'applied',
    "file_id" UUID,
    "note" TEXT,
    "ingredient_count" INTEGER NOT NULL DEFAULT 0,
    "affected_recipe_count" INTEGER NOT NULL DEFAULT 0,
    "affected_product_count" INTEGER NOT NULL DEFAULT 0,
    "background_job_id" UUID,
    "last_error" TEXT,
    "applied_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,

    CONSTRAINT "ingredient_price_update_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipe_type" VARCHAR(20) NOT NULL DEFAULT 'menu_item',
    "product_id" UUID,
    "variant_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "name_ar" VARCHAR(180),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "method" TEXT,
    "yield_qty" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "yield_uom" VARCHAR(20) NOT NULL DEFAULT 'portion',
    "output_dimension" VARCHAR(10) NOT NULL DEFAULT 'portion',
    "output_base_uom" VARCHAR(10) NOT NULL DEFAULT 'portion',
    "yield_base_qty" DECIMAL(18,6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipe_id" UUID NOT NULL,
    "ingredient_id" UUID,
    "sub_recipe_id" UUID,
    "quantity" DECIMAL(14,4) NOT NULL,
    "uom" VARCHAR(20) NOT NULL,
    "quantity_base" DECIMAL(18,6) NOT NULL,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "note" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,

    CONSTRAINT "recipe_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_costs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "variant_key" UUID NOT NULL,
    "recipe_id" UUID,
    "food_cost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "packaging_cost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "is_costed" BOOLEAN NOT NULL DEFAULT false,
    "cost_status" VARCHAR(30) NOT NULL DEFAULT 'no_recipe',
    "missing_ingredient_count" INTEGER NOT NULL DEFAULT 0,
    "computed_from" VARCHAR(20) NOT NULL DEFAULT 'recipe',
    "manual_food_cost" DECIMAL(12,4),
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,

    CONSTRAINT "product_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_cost_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "recipe_id" UUID,
    "batch_id" UUID,
    "old_food_cost" DECIMAL(12,4),
    "new_food_cost" DECIMAL(12,4) NOT NULL,
    "old_total_cost" DECIMAL(12,4),
    "new_total_cost" DECIMAL(12,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "change_percent" DECIMAL(10,4),
    "trigger" VARCHAR(30) NOT NULL,
    "changed_by_type" VARCHAR(20),
    "changed_by_id" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'fixed_basket',
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "currency" CHAR(3) NOT NULL,
    "fulfillment_type" "fulfillment_type" NOT NULL,
    "delivery_address_id" UUID,
    "department_id" UUID,
    "preferred_time" VARCHAR(8),
    "default_headcount" INTEGER NOT NULL DEFAULT 1,
    "source_meal_plan_id" UUID,
    "budget_per_meal" DECIMAL(12,2),
    "min_calories_kcal" DECIMAL(10,2),
    "max_calories_kcal" DECIMAL(10,2),
    "min_protein_g" DECIMAL(10,2),
    "max_protein_g" DECIMAL(10,2),
    "min_carbs_g" DECIMAL(10,2),
    "max_carbs_g" DECIMAL(10,2),
    "max_fat_g" DECIMAL(10,2),
    "slot_spec" JSONB,
    "exclude_allergens" VARCHAR(60)[],
    "variety_window_days" INTEGER NOT NULL DEFAULT 2,
    "last_used_at" TIMESTAMPTZ(6),
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "order_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_template_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_template_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "component_type" VARCHAR(30),
    "quantity_mode" VARCHAR(20) NOT NULL DEFAULT 'per_head',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "is_pinned" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_template_item_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_template_item_id" UUID NOT NULL,
    "product_option_id" UUID NOT NULL,

    CONSTRAINT "order_template_item_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "order_template_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Cairo',
    "frequency" VARCHAR(20) NOT NULL DEFAULT 'weekly',
    "interval_weeks" INTEGER NOT NULL DEFAULT 1,
    "weekdays" SMALLINT[],
    "week_start_weekday" SMALLINT NOT NULL DEFAULT 0,
    "anchor_date" DATE NOT NULL,
    "next_cycle_start_date" DATE NOT NULL,
    "open_from_date" DATE NOT NULL,
    "end_date" DATE,
    "max_cycles" INTEGER,
    "cycles_generated" INTEGER NOT NULL DEFAULT 0,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "open_ahead_days" INTEGER NOT NULL DEFAULT 14,
    "cutoff_days_before" INTEGER NOT NULL DEFAULT 2,
    "cutoff_time" VARCHAR(8) NOT NULL DEFAULT '16:00',
    "auto_confirm" BOOLEAN NOT NULL DEFAULT false,
    "fulfillment_type" "fulfillment_type",
    "delivery_address_id" UUID,
    "department_id" UUID,
    "preferred_time" VARCHAR(8),
    "ordered_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "order_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_schedule_cycles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_schedule_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "order_template_id" UUID NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "cycle_start_date" DATE NOT NULL,
    "cycle_end_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'planned',
    "headcount" INTEGER NOT NULL,
    "cutoff_at" TIMESTAMPTZ(6) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_by" UUID,
    "meal_plan_id" UUID,
    "series_id" UUID,
    "materialized_at" TIMESTAMPTZ(6),
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "skip_reason" VARCHAR(50),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,

    CONSTRAINT "order_schedule_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_schedule_cycle_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_schedule_cycle_id" UUID NOT NULL,
    "delivery_date" DATE NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "headcount" INTEGER NOT NULL,
    "is_skipped" BOOLEAN NOT NULL DEFAULT false,
    "preferred_time" VARCHAR(8),
    "order_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_schedule_cycle_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "production_date" DATE NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "window_end" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'locked',
    "snapshot_version" INTEGER NOT NULL DEFAULT 1,
    "locked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "company_count" INTEGER NOT NULL DEFAULT 0,
    "total_portions" INTEGER NOT NULL DEFAULT 0,
    "estimated_prep_minutes" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "currency_mismatch" BOOLEAN NOT NULL DEFAULT false,
    "snapshot_subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "snapshot_cost" DECIMAL(14,2),
    "costed_portions" INTEGER NOT NULL DEFAULT 0,
    "uncosted_portions" INTEGER NOT NULL DEFAULT 0,
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

    CONSTRAINT "production_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_plan_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "production_plan_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "product_name_snapshot" VARCHAR(255) NOT NULL,
    "variant_name_snapshot" VARCHAR(150),
    "category_id" UUID,
    "category_name_snapshot" VARCHAR(150),
    "component_type" VARCHAR(30),
    "confirmed_qty" INTEGER NOT NULL DEFAULT 0,
    "unconfirmed_qty" INTEGER NOT NULL DEFAULT 0,
    "produced_qty" INTEGER NOT NULL DEFAULT 0,
    "planned_qty" INTEGER NOT NULL,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "company_count" INTEGER NOT NULL DEFAULT 0,
    "prep_time_mins" INTEGER,
    "line_subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unit_cost_snapshot" DECIMAL(12,4),
    "line_cost" DECIMAL(14,2),
    "override_note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,

    CONSTRAINT "production_plan_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_tiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_ar" VARCHAR(100),
    "currency" CHAR(3) NOT NULL,
    "min_per_meal" DECIMAL(12,2) NOT NULL,
    "max_per_meal" DECIMAL(12,2),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,

    CONSTRAINT "budget_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE INDEX "suppliers_is_active_is_deleted_idx" ON "suppliers"("is_active", "is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_categories_slug_key" ON "ingredient_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_sku_key" ON "ingredients"("sku");

-- CreateIndex
CREATE INDEX "ingredients_ingredient_category_id_idx" ON "ingredients"("ingredient_category_id");

-- CreateIndex
CREATE INDEX "ingredients_supplier_id_idx" ON "ingredients"("supplier_id");

-- CreateIndex
CREATE INDEX "ingredients_is_active_is_deleted_idx" ON "ingredients"("is_active", "is_deleted");

-- CreateIndex
CREATE INDEX "ingredient_uom_conversions_ingredient_id_idx" ON "ingredient_uom_conversions"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_uom_conversions_ingredient_id_from_uom_to_uom_key" ON "ingredient_uom_conversions"("ingredient_id", "from_uom", "to_uom");

-- CreateIndex
CREATE INDEX "ingredient_price_history_ingredient_id_changed_at_idx" ON "ingredient_price_history"("ingredient_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "ingredient_price_history_batch_id_idx" ON "ingredient_price_history"("batch_id");

-- CreateIndex
CREATE INDEX "ingredient_price_history_changed_at_idx" ON "ingredient_price_history"("changed_at" DESC);

-- CreateIndex
CREATE INDEX "ingredient_price_update_batches_status_created_at_idx" ON "ingredient_price_update_batches"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ingredient_price_update_batches_created_at_idx" ON "ingredient_price_update_batches"("created_at" DESC);

-- CreateIndex
CREATE INDEX "recipes_product_id_variant_id_idx" ON "recipes"("product_id", "variant_id");

-- CreateIndex
CREATE INDEX "recipes_recipe_type_status_idx" ON "recipes"("recipe_type", "status");

-- CreateIndex
CREATE INDEX "recipe_lines_recipe_id_idx" ON "recipe_lines"("recipe_id");

-- CreateIndex
CREATE INDEX "recipe_lines_ingredient_id_idx" ON "recipe_lines"("ingredient_id");

-- CreateIndex
CREATE INDEX "recipe_lines_sub_recipe_id_idx" ON "recipe_lines"("sub_recipe_id");

-- CreateIndex
CREATE INDEX "product_costs_is_costed_idx" ON "product_costs"("is_costed");

-- CreateIndex
CREATE INDEX "product_costs_recipe_id_idx" ON "product_costs"("recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_costs_product_id_variant_key_key" ON "product_costs"("product_id", "variant_key");

-- CreateIndex
CREATE INDEX "product_cost_history_product_id_changed_at_idx" ON "product_cost_history"("product_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "product_cost_history_batch_id_idx" ON "product_cost_history"("batch_id");

-- CreateIndex
CREATE INDEX "product_cost_history_changed_at_idx" ON "product_cost_history"("changed_at" DESC);

-- CreateIndex
CREATE INDEX "order_templates_company_id_status_idx" ON "order_templates"("company_id", "status");

-- CreateIndex
CREATE INDEX "order_templates_source_meal_plan_id_idx" ON "order_templates"("source_meal_plan_id");

-- CreateIndex
CREATE INDEX "order_template_items_order_template_id_idx" ON "order_template_items"("order_template_id");

-- CreateIndex
CREATE INDEX "order_template_items_product_id_idx" ON "order_template_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_template_item_options_order_template_item_id_product__key" ON "order_template_item_options"("order_template_item_id", "product_option_id");

-- CreateIndex
CREATE INDEX "order_schedules_company_id_is_active_idx" ON "order_schedules"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "order_schedules_is_active_is_deleted_open_from_date_idx" ON "order_schedules"("is_active", "is_deleted", "open_from_date");

-- CreateIndex
CREATE INDEX "order_schedules_order_template_id_idx" ON "order_schedules"("order_template_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_schedule_cycles_meal_plan_id_key" ON "order_schedule_cycles"("meal_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_schedule_cycles_series_id_key" ON "order_schedule_cycles"("series_id");

-- CreateIndex
CREATE INDEX "order_schedule_cycles_status_cutoff_at_idx" ON "order_schedule_cycles"("status", "cutoff_at");

-- CreateIndex
CREATE INDEX "order_schedule_cycles_status_cycle_start_date_idx" ON "order_schedule_cycles"("status", "cycle_start_date");

-- CreateIndex
CREATE INDEX "order_schedule_cycles_company_id_cycle_start_date_idx" ON "order_schedule_cycles"("company_id", "cycle_start_date");

-- CreateIndex
CREATE INDEX "order_schedule_cycles_order_schedule_id_cycle_start_date_idx" ON "order_schedule_cycles"("order_schedule_id", "cycle_start_date");

-- CreateIndex
CREATE UNIQUE INDEX "order_schedule_cycles_order_schedule_id_cycle_start_date_key" ON "order_schedule_cycles"("order_schedule_id", "cycle_start_date");

-- CreateIndex
CREATE INDEX "order_schedule_cycle_days_order_schedule_cycle_id_idx" ON "order_schedule_cycle_days"("order_schedule_cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_schedule_cycle_days_order_schedule_cycle_id_delivery__key" ON "order_schedule_cycle_days"("order_schedule_cycle_id", "delivery_date");

-- CreateIndex
CREATE INDEX "production_plans_production_date_idx" ON "production_plans"("production_date");

-- CreateIndex
CREATE INDEX "production_plans_status_idx" ON "production_plans"("status");

-- CreateIndex
CREATE INDEX "production_plan_lines_production_plan_id_idx" ON "production_plan_lines"("production_plan_id");

-- CreateIndex
CREATE INDEX "production_plan_lines_product_id_idx" ON "production_plan_lines"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_tiers_code_key" ON "budget_tiers"("code");

-- CreateIndex
CREATE INDEX "budget_tiers_currency_sort_order_idx" ON "budget_tiers"("currency", "sort_order");

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_ingredient_category_id_fkey" FOREIGN KEY ("ingredient_category_id") REFERENCES "ingredient_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_uom_conversions" ADD CONSTRAINT "ingredient_uom_conversions_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_price_history" ADD CONSTRAINT "ingredient_price_history_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_price_history" ADD CONSTRAINT "ingredient_price_history_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "ingredient_price_update_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_sub_recipe_id_fkey" FOREIGN KEY ("sub_recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_costs" ADD CONSTRAINT "product_costs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_costs" ADD CONSTRAINT "product_costs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_costs" ADD CONSTRAINT "product_costs_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_cost_history" ADD CONSTRAINT "product_cost_history_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "ingredient_price_update_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_templates" ADD CONSTRAINT "order_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_templates" ADD CONSTRAINT "order_templates_delivery_address_id_fkey" FOREIGN KEY ("delivery_address_id") REFERENCES "company_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_templates" ADD CONSTRAINT "order_templates_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_templates" ADD CONSTRAINT "order_templates_source_meal_plan_id_fkey" FOREIGN KEY ("source_meal_plan_id") REFERENCES "meal_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_template_items" ADD CONSTRAINT "order_template_items_order_template_id_fkey" FOREIGN KEY ("order_template_id") REFERENCES "order_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_template_items" ADD CONSTRAINT "order_template_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_template_items" ADD CONSTRAINT "order_template_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_template_item_options" ADD CONSTRAINT "order_template_item_options_order_template_item_id_fkey" FOREIGN KEY ("order_template_item_id") REFERENCES "order_template_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_template_item_options" ADD CONSTRAINT "order_template_item_options_product_option_id_fkey" FOREIGN KEY ("product_option_id") REFERENCES "product_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_schedules" ADD CONSTRAINT "order_schedules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_schedules" ADD CONSTRAINT "order_schedules_order_template_id_fkey" FOREIGN KEY ("order_template_id") REFERENCES "order_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_schedules" ADD CONSTRAINT "order_schedules_delivery_address_id_fkey" FOREIGN KEY ("delivery_address_id") REFERENCES "company_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_schedules" ADD CONSTRAINT "order_schedules_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_schedules" ADD CONSTRAINT "order_schedules_ordered_by_user_id_fkey" FOREIGN KEY ("ordered_by_user_id") REFERENCES "company_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_schedule_cycles" ADD CONSTRAINT "order_schedule_cycles_order_schedule_id_fkey" FOREIGN KEY ("order_schedule_id") REFERENCES "order_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_schedule_cycles" ADD CONSTRAINT "order_schedule_cycles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_schedule_cycles" ADD CONSTRAINT "order_schedule_cycles_order_template_id_fkey" FOREIGN KEY ("order_template_id") REFERENCES "order_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_schedule_cycles" ADD CONSTRAINT "order_schedule_cycles_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "meal_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_schedule_cycles" ADD CONSTRAINT "order_schedule_cycles_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "order_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_schedule_cycle_days" ADD CONSTRAINT "order_schedule_cycle_days_order_schedule_cycle_id_fkey" FOREIGN KEY ("order_schedule_cycle_id") REFERENCES "order_schedule_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_schedule_cycle_days" ADD CONSTRAINT "order_schedule_cycle_days_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plan_lines" ADD CONSTRAINT "production_plan_lines_production_plan_id_fkey" FOREIGN KEY ("production_plan_id") REFERENCES "production_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plan_lines" ADD CONSTRAINT "production_plan_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plan_lines" ADD CONSTRAINT "production_plan_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE recipe_lines ADD CONSTRAINT recipe_lines_one_child_ck
  CHECK (num_nonnulls(ingredient_id, sub_recipe_id) = 1);
ALTER TABLE recipe_lines ADD CONSTRAINT recipe_lines_no_self_ref_ck
  CHECK (sub_recipe_id IS NULL OR sub_recipe_id <> recipe_id);
ALTER TABLE recipes ADD CONSTRAINT recipes_type_product_ck
  CHECK ((recipe_type = 'menu_item' AND product_id IS NOT NULL)
      OR (recipe_type = 'prep'      AND product_id IS NULL));
ALTER TABLE recipes ADD CONSTRAINT recipes_positive_yield_ck
  CHECK (yield_qty > 0 AND yield_base_qty > 0);
ALTER TABLE ingredients ADD CONSTRAINT ingredients_positive_purchase_ck
  CHECK (purchase_qty > 0 AND purchase_price >= 0
         AND yield_percent > 0 AND yield_percent <= 100);
-- variant_key is derived; a drifted value would silently split a cost row.
ALTER TABLE product_costs ADD CONSTRAINT product_costs_variant_key_ck
  CHECK (variant_key = COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
-- At most one active menu_item recipe per sellable.
CREATE UNIQUE INDEX recipes_active_menu_item_variant_uq
  ON recipes (product_id, variant_id)
  WHERE recipe_type = 'menu_item' AND status = 'active' AND is_deleted = false AND variant_id IS NOT NULL;
CREATE UNIQUE INDEX recipes_active_menu_item_base_uq
  ON recipes (product_id)
  WHERE recipe_type = 'menu_item' AND status = 'active' AND is_deleted = false AND variant_id IS NULL;
-- Ingredient search is `contains`/insensitive (catalog.service.ts:200 idiom); btree cannot serve it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX ingredients_name_trgm_idx ON ingredients USING gin (name gin_trgm_ops);
