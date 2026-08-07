-- DropIndex
DROP INDEX "ingredients_name_trgm_idx";

-- AlterTable
ALTER TABLE "meal_plans" ADD COLUMN     "require_diet_tags" VARCHAR(40)[];

-- AlterTable
ALTER TABLE "product_nutrition" ADD COLUMN     "diet_tags" VARCHAR(40)[];
