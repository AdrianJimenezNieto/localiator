-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';
ALTER TYPE "OrderStatus" ADD VALUE 'DISPUTED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "disputedAt" TIMESTAMP(3),
ADD COLUMN     "preDisputeStatus" "OrderStatus",
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundedCents" INTEGER NOT NULL DEFAULT 0;
