import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Tope de página: impide que alguien pida 10.000 items de golpe (coste/DoS).
export const MAX_PAGE_SIZE = 60;
export const DEFAULT_PAGE_SIZE = 24;

// Query params del listado público. Llegan como string en la URL; @Type los
// convierte a número antes de validar (el ValidationPipe global tiene transform:true).
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
}
