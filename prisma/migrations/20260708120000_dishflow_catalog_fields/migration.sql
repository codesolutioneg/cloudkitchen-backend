-- Dishflow-aligned catalog fields (images, Arabic names, external import refs)
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "name_ar" VARCHAR(150);
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "external_ref" VARCHAR(120);
CREATE UNIQUE INDEX IF NOT EXISTS "categories_external_ref_key" ON "categories"("external_ref");

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "prep_time_mins" INTEGER DEFAULT 25;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "external_ref" VARCHAR(120);
CREATE UNIQUE INDEX IF NOT EXISTS "products_external_ref_key" ON "products"("external_ref");
