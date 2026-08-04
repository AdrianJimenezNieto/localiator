-- Índice para el calendario público de subastas: filtro por estado (IN) + rango
-- sobre `endsAt`, ordenando por `endsAt`. El listado paginado usa la misma forma
-- de consulta, así que también se apoya en él.
CREATE INDEX "Auction_status_endsAt_idx" ON "Auction"("status", "endsAt");
