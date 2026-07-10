import { IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';

// Estado destino de una transición manual del admin. La LEGALIDAD de la
// transición (no saltar estados) la valida el servicio; aquí solo acotamos que
// sea un estado conocido.
export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus, { message: 'Estado de pedido no válido' })
  status!: OrderStatus;
}
