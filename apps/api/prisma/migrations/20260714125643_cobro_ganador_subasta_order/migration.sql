-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "auctionId" TEXT;

-- CreateIndex
CREATE INDEX "Order_auctionId_idx" ON "Order"("auctionId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
