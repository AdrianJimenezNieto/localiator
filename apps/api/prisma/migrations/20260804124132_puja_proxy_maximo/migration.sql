-- Puja proxy (puja automática por máximo).
--
-- Añade el estado del proxy a Auction (precio efectivo, líder y su techo) y el
-- techo por puja a Bid. Antes de esta migración, "pujar" significaba comprometer
-- exactamente ese importe, así que el backfill de los datos existentes es directo:
-- el máximo de cada puja antigua ERA su importe.

-- Estado del proxy en la subasta. Nullable: una subasta sin pujas no tiene ni
-- precio efectivo ni líder.
ALTER TABLE "Auction" ADD COLUMN     "currentPriceCents" INTEGER,
ADD COLUMN     "leaderMaxCents" INTEGER,
ADD COLUMN     "leaderUserId" TEXT;

-- `maxAmountCents` acaba siendo NOT NULL, pero no puede crearse así de golpe sobre
-- una tabla con filas: se añade nullable, se rellena y se fuerza NOT NULL después.
ALTER TABLE "Bid" ADD COLUMN     "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxAmountCents" INTEGER;

-- Backfill de Bid: sin proxy, el techo de una puja era su propio importe.
UPDATE "Bid" SET "maxAmountCents" = "amountCents" WHERE "maxAmountCents" IS NULL;

ALTER TABLE "Bid" ALTER COLUMN "maxAmountCents" SET NOT NULL;

-- Backfill de Auction: el estado del proxy se reconstruye desde la puja más alta
-- de cada subasta, que es exactamente como se derivaba el líder hasta ahora.
-- DISTINCT ON + ORDER BY toma una sola fila por subasta: la de mayor importe y, a
-- igualdad de importe, la más antigua (mismo criterio de desempate que la regla de
-- negocio: a un empate no se destrona a quien llegó primero).
UPDATE "Auction" a
SET "currentPriceCents" = b."amountCents",
    "leaderUserId"      = b."userId",
    "leaderMaxCents"    = b."maxAmountCents"
FROM (
  SELECT DISTINCT ON ("auctionId") "auctionId", "amountCents", "maxAmountCents", "userId"
  FROM "Bid"
  ORDER BY "auctionId", "amountCents" DESC, "createdAt" ASC
) b
WHERE b."auctionId" = a."id";

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_leaderUserId_fkey" FOREIGN KEY ("leaderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
