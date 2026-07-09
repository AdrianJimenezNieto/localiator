import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ItemCondition } from '@prisma/client';
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
  @IsString()
  categoryId?: string;

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

  // Uno o varios estados. En la URL puede venir como `condition=NEW&condition=GOOD`
  // (array) o `condition=NEW` (string): normalizamos a array antes de validar.
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : Array.isArray(value) ? value : [value],
  )
  @IsArray()
  @IsEnum(ItemCondition, {
    each: true,
    message: 'Estado de artículo no válido',
  })
  condition?: ItemCondition[];
}
