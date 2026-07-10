import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderItemType } from '@prisma/client';

// Topes defensivos: acotan el tamaño del carrito para evitar peticiones absurdas
// (coste/DoS) y cantidades irreales por línea.
export const MAX_ORDER_LINES = 50;
export const MAX_LINE_QUANTITY = 100;

// Una línea del carrito tal como llega del cliente. Ojo: NO se acepta el precio.
// El servidor lo relee de BD (seguridad, tarea 03); confiar en el precio del
// cliente permitiría pagar de menos.
export class CreateOrderLineDto {
  @IsEnum(OrderItemType, { message: 'Tipo de artículo no válido' })
  itemType!: OrderItemType;

  @IsString()
  @MaxLength(60)
  itemId!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity!: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'El carrito está vacío' })
  @ArrayMaxSize(MAX_ORDER_LINES)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderLineDto)
  items!: CreateOrderLineDto[];
}
