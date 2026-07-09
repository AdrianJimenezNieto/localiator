import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ItemCondition } from '@prisma/client';
import { IsNotGreaterThanProperty } from './is-not-greater-than.decorator';

// Alta de lote. Mismas reglas que el producto (02): Lot y Product son entidades
// separadas pero comparten forma, y la duplicación del DTO es deliberada para que
// puedan diverger en el futuro sin deshacer una abstracción.
export class CreateLotDto {
  @IsString()
  @MinLength(1, { message: 'El nombre no puede estar vacío' })
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(1, { message: 'La descripción no puede estar vacía' })
  @MaxLength(5000)
  description!: string;

  @IsEnum(ItemCondition, { message: 'Estado de artículo no válido' })
  condition!: ItemCondition;

  @IsInt({ message: 'El precio debe ser un entero en céntimos' })
  @Min(0)
  priceCents!: number;

  @IsOptional()
  @IsInt({ message: 'El descuento debe ser un entero en céntimos' })
  @Min(0)
  @IsNotGreaterThanProperty('priceCents', {
    message: 'El descuento no puede ser mayor que el precio',
  })
  discountCents?: number;

  @IsInt()
  @Min(0)
  stock!: number;

  @IsString()
  @MinLength(1, { message: 'La categoría es obligatoria' })
  categoryId!: string;

  @IsOptional()
  @IsArray()
  @IsUrl(
    { require_tld: false },
    { each: true, message: 'Cada foto debe ser una URL válida' },
  )
  photos?: string[];
}
