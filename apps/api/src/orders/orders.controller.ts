import { Body, Controller, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

// Pedidos del comprador. El admin también puede (útil para pruebas/soporte); el
// invitado no (necesita cuenta y email verificado, que valida el servicio).
@Controller('orders')
@Roles(Role.BUYER, Role.ADMIN)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // Crea el pedido y reserva el stock. Recibe solo tipo/id/cantidad de cada línea;
  // el precio y el total los fija el servidor releyendo BD.
  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: RequestUser) {
    return this.orders.createOrder(user.userId, dto);
  }
}
