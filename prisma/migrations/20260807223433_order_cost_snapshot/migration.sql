-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "cost_snapshot_source" VARCHAR(20),
ADD COLUMN     "unit_cost_snapshot" DECIMAL(12,4);
