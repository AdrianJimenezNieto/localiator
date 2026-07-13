-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('SCHEDULED', 'LIVE', 'CLOSED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "itemType" "OrderItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "startingPriceCents" INTEGER NOT NULL,
    "minIncrementCents" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "winnerUserId" TEXT,
    "winningBidId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Auction_winningBidId_key" ON "Auction"("winningBidId");

-- CreateIndex
CREATE INDEX "Auction_status_idx" ON "Auction"("status");

-- CreateIndex
CREATE INDEX "Auction_itemType_itemId_idx" ON "Auction"("itemType", "itemId");

-- CreateIndex
CREATE INDEX "Bid_auctionId_amountCents_idx" ON "Bid"("auctionId", "amountCents");

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
