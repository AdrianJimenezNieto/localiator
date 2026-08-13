import { Controller, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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

  // Rate limit propio, más estricto que el global de 100/min: cada llamada crea
  // una Checkout Session real en Stripe (petición saliente + objeto en su cuenta).
  // Pagar un pedido son 1-2 intentos legítimos; 5 por minuto sobra y corta de raíz
  // que alguien use este endpoint autenticado para martillear la API de Stripe.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':id/pay')
  pay(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.payments.createCheckoutSession(id, user.userId);
  }
}
