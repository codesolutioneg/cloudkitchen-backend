-- CreateTable
CREATE TABLE "product_nutrition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "component_type" VARCHAR(30) NOT NULL DEFAULT 'other',
    "serving_size_g" INTEGER,
    "calories_kcal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "protein_g" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "carbs_g" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fat_g" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fiber_g" DECIMAL(10,2),
    "sodium_mg" DECIMAL(10,2),
    "allergens" VARCHAR(60)[],
    "ingredients" TEXT,
    "source" VARCHAR(60),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,

    CONSTRAINT "product_nutrition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "budget_per_meal" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "pricing_list_id" UUID,
    "source_menu_id" UUID,
    "min_calories_kcal" DECIMAL(10,2),
    "max_calories_kcal" DECIMAL(10,2),
    "min_protein_g" DECIMAL(10,2),
    "max_protein_g" DECIMAL(10,2),
    "min_carbs_g" DECIMAL(10,2),
    "max_carbs_g" DECIMAL(10,2),
    "max_fat_g" DECIMAL(10,2),
    "slot_spec" JSONB NOT NULL,
    "exclude_allergens" VARCHAR(60)[],
    "variety_window_days" INTEGER NOT NULL DEFAULT 2,
    "generated_at" TIMESTAMPTZ(6),
    "is_feasible" BOOLEAN NOT NULL DEFAULT false,
    "warnings" JSONB,
    "total_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "avg_cost_per_meal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "avg_calories_kcal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "avg_protein_g" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "avg_carbs_g" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "avg_fat_g" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "approved_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_type" VARCHAR(20),
    "created_by_id" UUID,
    "updated_by_type" VARCHAR(20),
    "updated_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plan_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "meal_plan_id" UUID NOT NULL,
    "plan_date" DATE NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "cost_per_head" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "calories_kcal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "protein_g" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "carbs_g" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fat_g" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_feasible" BOOLEAN NOT NULL DEFAULT false,
    "warnings" JSONB,

    CONSTRAINT "meal_plan_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plan_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "meal_plan_day_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "component_type" VARCHAR(30) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "calories_kcal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "protein_g" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "carbs_g" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fat_g" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "meal_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_nutrition_product_id_key" ON "product_nutrition"("product_id");

-- CreateIndex
CREATE INDEX "product_nutrition_component_type_idx" ON "product_nutrition"("component_type");

-- CreateIndex
CREATE INDEX "meal_plans_company_id_status_idx" ON "meal_plans"("company_id", "status");

-- CreateIndex
CREATE INDEX "meal_plans_start_date_idx" ON "meal_plans"("start_date");

-- CreateIndex
CREATE INDEX "meal_plan_days_meal_plan_id_idx" ON "meal_plan_days"("meal_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plan_days_meal_plan_id_plan_date_key" ON "meal_plan_days"("meal_plan_id", "plan_date");

-- CreateIndex
CREATE INDEX "meal_plan_items_meal_plan_day_id_idx" ON "meal_plan_items"("meal_plan_day_id");

-- CreateIndex
CREATE INDEX "meal_plan_items_product_id_idx" ON "meal_plan_items"("product_id");

-- AddForeignKey
ALTER TABLE "product_nutrition" ADD CONSTRAINT "product_nutrition_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_pricing_list_id_fkey" FOREIGN KEY ("pricing_list_id") REFERENCES "product_pricing_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_source_menu_id_fkey" FOREIGN KEY ("source_menu_id") REFERENCES "catalog_menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_days" ADD CONSTRAINT "meal_plan_days_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_items" ADD CONSTRAINT "meal_plan_items_meal_plan_day_id_fkey" FOREIGN KEY ("meal_plan_day_id") REFERENCES "meal_plan_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_items" ADD CONSTRAINT "meal_plan_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_items" ADD CONSTRAINT "meal_plan_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
