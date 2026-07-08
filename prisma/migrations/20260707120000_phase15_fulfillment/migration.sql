-- Phase 15: Delivery assignment, QR fulfillment token, pickup/delivery workflow support

ALTER TABLE "orders" ADD COLUMN "fulfillment_qr_token" VARCHAR(64);

CREATE UNIQUE INDEX "orders_fulfillment_qr_token_key" ON "orders"("fulfillment_qr_token");

ALTER TABLE "order_delivery_details" ADD COLUMN "assigned_dashboard_user_id" UUID;
ALTER TABLE "order_delivery_details" ADD COLUMN "assigned_by" UUID;
ALTER TABLE "order_delivery_details" ADD COLUMN "assigned_at" TIMESTAMPTZ(6);

CREATE INDEX "order_delivery_details_assigned_dashboard_user_id_idx" ON "order_delivery_details"("assigned_dashboard_user_id");

ALTER TABLE "order_delivery_details" ADD CONSTRAINT "order_delivery_details_assigned_dashboard_user_id_fkey" FOREIGN KEY ("assigned_dashboard_user_id") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_delivery_details" ADD CONSTRAINT "order_delivery_details_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
