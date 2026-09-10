import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsNotGreaterThanProperty } from './is-not-greater-than.decorator';

// Tope de página: impide que alguien pida 10.000 items de golpe (coste/DoS).
export const MAX_PAGE_SIZE = 60;
export const DEFAULT_PAGE_SIZE = 24;
// Recorte de la búsqueda de texto: evita consultas absurdas con textos enormes.
export const MAX_QUERY_LENGTH = 100;

// Query params del listado público: paginación (06) + búsqueda y filtros (07).
// Llegan como string en la URL; @Type los convierte a número antes de validar (el
// ValidationPipe global tiene transform:true). Todos los filtros son opcionales y
// combinables: el que no viene, no filtra.
export class ListCatalogDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  // Texto libre: se busca en name/description (contains, case-insensitive).
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(MAX_QUERY_LENGTH)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  // min ≤ max: si el rango viene invertido, 400 del ValidationPipe. El validador
  // solo compara cuando maxPriceCents también es número; si falta, no filtra tope.
  @IsNotGreaterThanProperty('maxPriceCents', {
    message: 'minPriceCents no puede ser mayor que maxPriceCents',
  })
  minPriceCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPriceCents?: number;
}
