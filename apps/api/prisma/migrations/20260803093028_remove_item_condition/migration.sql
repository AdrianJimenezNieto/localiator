-- AlterTable
ALTER TABLE "Lot" DROP COLUMN "condition";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "condition";

-- DropEnum
DROP TYPE "ItemCondition";
