import {
  IsDateString,
  IsEnum,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { OrderItemType } from '@prisma/client';

// Alta de subasta (solo admin, tarea 11). Como el resto de DTOs del proyecto, aquí
// solo se valida la FORMA; las reglas de negocio (que el artículo exista, que no
// haya ya una subasta viva sobre él, coherencia de fechas) viven en el servicio,
// que es donde se pueden testear con datos. Mismo criterio que PlaceBidDto.
export class CreateAuctionDto {
  // Polimórfico: la subasta apunta a un Product o un Lot, que son entidades
  // separadas sin FK común (tarea 01). Que el id exista lo comprueba el servicio.
  @IsEnum(OrderItemType, { message: 'Tipo de artículo no válido' })
  itemType!: OrderItemType;

  @IsString()
  @MinLength(1, { message: 'El artículo es obligatorio' })
  @MaxLength(64)
  itemId!: string;

  // Dinero SIEMPRE en céntimos (Int): la conversión euros↔céntimos es del frontend.
  // El tope evita que un dedazo cree una subasta de salida absurda.
  @IsInt({ message: 'El precio de salida debe ser un entero en céntimos' })
  @Min(0)
  @Max(100_000_000)
  startingPriceCents!: number;

  // > 0: un incremento de 0 permitiría "superar" una puja igualándola y rompería
  // la regla de que siempre haya un único líder (ver assertBeats).
  @IsInt({ message: 'El incremento mínimo debe ser un entero en céntimos' })
  @Min(1, { message: 'El incremento mínimo debe ser mayor que cero' })
  @Max(100_000_000)
  minIncrementCents!: number;

  @IsDateString({}, { message: 'La fecha de inicio no es válida' })
  startsAt!: string;

  @IsDateString({}, { message: 'La fecha de cierre no es válida' })
  endsAt!: string;
}
