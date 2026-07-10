import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

// Pedidos del comprador. El admin también puede (útil para pruebas/soporte); el
// invitado no (necesita cuenta y email verificado, que valida el servicio). Las
// rutas de gestión llevan @Roles(ADMIN) a nivel de método (gana sobre la clase).
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

  // "Mis pedidos" del comprador autenticado.
  @Get()
  listMine(@CurrentUser() user: RequestUser) {
    return this.orders.listMyOrders(user.userId);
  }

  // Listado de gestión (admin), filtrable por estado. Ruta específica (/admin)
  // antes que /:id para que no la capture el parámetro.
  @Get('admin')
  @Roles(Role.ADMIN)
  listAll(@Query('status') status?: OrderStatus) {
    return this.orders.listAllOrders(status);
  }

  // Detalle de un pedido (dueño o admin).
  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.orders.getOrderForUser(
      id,
      user.userId,
      user.role === Role.ADMIN,
    );
  }

  // Transición de estado manual (flujo de recogida): solo admin.
  @Patch(':id/status')
  @Roles(Role.ADMIN)
  transition(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.transitionStatus(id, dto.status);
  }
}
