-- Ecommerce phases: order series, payment proof, series link on orders

CREATE TABLE "order_series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "ordered_by_user_id" UUID NOT NULL,
    "fulfillment_type" "fulfillment_type" NOT NULL,
    "delivery_address_id" UUID,
    "department_id" UUID,
    "preferred_time" VARCHAR(8),
    "source_channel" VARCHAR(20) NOT NULL DEFAULT 'web',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_series_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "proof_attachment_id" UUID,
    "receipt_file_id" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "orders" ADD COLUMN "series_id" UUID;

CREATE UNIQUE INDEX "order_payments_order_id_key" ON "order_payments"("order_id");
CREATE INDEX "order_payments_status_idx" ON "order_payments"("status");
CREATE INDEX "order_series_company_id_created_at_idx" ON "order_series"("company_id", "created_at" DESC);
CREATE INDEX "orders_series_id_idx" ON "orders"("series_id");

ALTER TABLE "order_series" ADD CONSTRAINT "order_series_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_series" ADD CONSTRAINT "order_series_ordered_by_user_id_fkey" FOREIGN KEY ("ordered_by_user_id") REFERENCES "company_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "order_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
