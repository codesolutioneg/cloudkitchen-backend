-- Company custom products: ownership, approval workflow, nullable price until approved

ALTER TABLE "products" ALTER COLUMN "base_price" DROP NOT NULL;

ALTER TABLE "products" ADD COLUMN "company_id" UUID;
ALTER TABLE "products" ADD COLUMN "approval_status" VARCHAR(20) NOT NULL DEFAULT 'approved';
ALTER TABLE "products" ADD COLUMN "rejection_reason" TEXT;
ALTER TABLE "products" ADD COLUMN "approved_by" UUID;
ALTER TABLE "products" ADD COLUMN "approved_at" TIMESTAMPTZ(6);

CREATE INDEX "products_company_id_approval_status_idx" ON "products"("company_id", "approval_status");

ALTER TABLE "products" ADD CONSTRAINT "products_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
