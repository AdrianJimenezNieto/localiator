import { apiGet, apiSend } from './api';
import type { OrderItemType } from './orders';

// Estados de subasta tal como los devuelve la API (enum Prisma AuctionStatus).
export type ApiAuctionStatus = 'SCHEDULED' | 'LIVE' | 'CLOSED' | 'PAID' | 'CANCELLED';

export const AUCTION_STATUS_LABELS: Record<ApiAuctionStatus, string> = {
  SCHEDULED: 'Programada',
  LIVE: 'En curso',
  CLOSED: 'Cerrada',
  PAID: 'Pagada',
  CANCELLED: 'Cancelada',
};

// Fila de subasta tal como la devuelven GET /admin/auctions y GET /admin/auctions/:id
// (auctions.service.ts, listAuctionsForAdmin / getAuctionForAdmin): vista interna, sin
// enmascarar al ganador.
export interface AdminAuction {
  id: string;
  itemType: OrderItemType;
  itemId: string;
  itemName: string | null;
  status: ApiAuctionStatus;
  startingPriceCents: number;
  minIncrementCents: number;
  currentPriceCents: number;
  bidCount: number;
  startsAt: string;
  endsAt: string;
  winner: { id: string; email: string } | null;
  paymentDueAt: string | null;
}

// Alta: los mismos campos que CreateAuctionDto (auctions/dto/create-auction.dto.ts).
export interface CreateAuctionPayload {
  itemType: OrderItemType;
  itemId: string;
  startingPriceCents: number;
  minIncrementCents: number;
  startsAt: string;
  endsAt: string;
}

// Edición: UpdateAuctionDto excluye itemType/itemId (no se pueden cambiar).
export type UpdateAuctionPayload = Partial<
  Omit<CreateAuctionPayload, 'itemType' | 'itemId'>
>;

export function adminListAuctions(
  token: string,
  status?: ApiAuctionStatus,
): Promise<AdminAuction[]> {
  const qs = status ? `?status=${status}` : '';
  return apiGet<AdminAuction[]>(`/admin/auctions${qs}`, token);
}

export function adminGetAuction(id: string, token: string): Promise<AdminAuction> {
  return apiGet<AdminAuction>(`/admin/auctions/${id}`, token);
}

export function adminCreateAuction(
  payload: CreateAuctionPayload,
  token: string,
): Promise<AdminAuction> {
  return apiSend<AdminAuction>('POST', '/admin/auctions', payload, token);
}

export function adminUpdateAuction(
  id: string,
  payload: UpdateAuctionPayload,
  token: string,
): Promise<AdminAuction> {
  return apiSend<AdminAuction>('PATCH', `/admin/auctions/${id}`, payload, token);
}

export function adminCancelAuction(id: string, token: string): Promise<AdminAuction> {
  return apiSend<AdminAuction>('POST', `/admin/auctions/${id}/cancel`, undefined, token);
}
