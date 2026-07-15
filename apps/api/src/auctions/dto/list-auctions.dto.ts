import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuctionStatus } from '@prisma/client';

// Tope de página: impide que alguien pida miles de subastas de golpe (coste/DoS).
// Mismos valores que el catálogo (list-catalog.dto.ts), a propósito.
export const MAX_AUCTION_PAGE_SIZE = 60;
export const DEFAULT_AUCTION_PAGE_SIZE = 24;

// Estados que un invitado puede pedir. CLOSED entra (da prueba social y contenido
// indexable: "esto se vendió por X"), pero PAID y CANCELLED no: son ruido interno
// que no aporta nada a quien mira el listado.
export const PUBLIC_AUCTION_STATUSES = [
  AuctionStatus.LIVE,
  AuctionStatus.SCHEDULED,
  AuctionStatus.CLOSED,
] as const;

// Query params del listado público de subastas (tarea 12). Llegan como string en
// la URL; @Type los convierte antes de validar (el ValidationPipe global tiene
// transform:true). Todos opcionales: el que no viene, no filtra.
export class ListAuctionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_AUCTION_PAGE_SIZE)
  pageSize?: number;

  // Uno o varios estados, como el `condition` del catálogo: puede venir como
  // `status=LIVE&status=CLOSED` (array) o `status=LIVE` (string). Se restringe a
  // PUBLIC_AUCTION_STATUSES: pedir PAID o CANCELLED da 400, no una lista vacía
  // silenciosa (un filtro que no filtra lo que pides es peor que un error claro).
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : Array.isArray(value) ? value : [value],
  )
  @IsArray()
  @IsEnum(PUBLIC_AUCTION_STATUSES, {
    each: true,
    message: 'Estado de subasta no válido',
  })
  status?: (typeof PUBLIC_AUCTION_STATUSES)[number][];
}
