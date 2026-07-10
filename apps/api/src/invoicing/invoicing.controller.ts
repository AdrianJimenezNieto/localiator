import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicingService } from './invoicing.service';

// Descarga de la factura de un pedido. El dueño del pedido (o un admin) puede
// verla; se sirve como HTML (MVP sin PDF).
@Controller('orders')
@Roles(Role.BUYER, Role.ADMIN)
export class InvoicingController {
  constructor(
    private readonly invoicing: InvoicingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':id/invoice')
  async invoice(
    @Param('id') orderId: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    // Pedido ajeno = inexistente (no revelamos que existe).
    if (!order || (user.role !== Role.ADMIN && order.userId !== user.userId)) {
      throw new NotFoundException('Factura no encontrada');
    }
    const invoice = await this.prisma.invoice.findUnique({
      where: { orderId },
    });
    if (!invoice) {
      throw new NotFoundException('La factura aún no está disponible');
    }
    res.type('html').send(this.invoicing.renderHtml(invoice));
  }
}
