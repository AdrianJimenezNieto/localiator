import { Controller, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';
import { PaymentsService } from './payments.service';

// Pago de un pedido. Ruta bajo /orders/:id/pay porque conceptualmente es una
// acción sobre el pedido; el servicio valida que el pedido es del usuario.
@Controller('orders')
@Roles(Role.BUYER, Role.ADMIN)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':id/pay')
  pay(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.payments.createCheckoutSession(id, user.userId);
  }
}
