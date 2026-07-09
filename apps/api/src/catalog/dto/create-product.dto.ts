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

// Alta de producto individual. Dinero SIEMPRE en céntimos (Int): la conversión
// euros↔céntimos es cosa del frontend; aquí exigimos enteros para evitar los
// errores de coma flotante. Misma forma que el DTO de lote (03), a propósito.
export class CreateProductDto {
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

  // Obligatoria: todo producto nace filtrable por categoría. El service valida que
  // la categoría exista (400 legible en vez del P2003 opaco de la FK).
  @IsString()
  @MinLength(1, { message: 'La categoría es obligatoria' })
  categoryId!: string;

  // La subida real de fotos es la tarea 05; aquí se aceptan como array de URLs ya
  // existentes en el esquema.
  @IsOptional()
  @IsArray()
  @IsUrl(
    { require_tld: false },
    { each: true, message: 'Cada foto debe ser una URL válida' },
  )
  photos?: string[];
}
