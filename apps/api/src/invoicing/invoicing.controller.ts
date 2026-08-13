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
    const invoice = await this.invoicing.findOriginal(orderId);
    if (!invoice) {
      throw new NotFoundException('La factura aún no está disponible');
    }
    res.type('html').send(this.invoicing.renderHtml(invoice));
  }

  // Todos los documentos fiscales del pedido: la factura y sus rectificativas. El
  // cliente necesita poder descargar la rectificativa de un reembolso, no solo la
  // original.
  @Get(':id/invoices')
  async invoices(
    @Param('id') orderId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.assertOwnership(orderId, user);
    const docs = await this.invoicing.listForOrder(orderId);
    return docs.map((d) => ({
      number: d.number,
      type: d.type,
      issuedAt: d.issuedAt,
      grossCents: d.grossCents,
    }));
  }

  @Get(':id/invoices/:number')
  async invoiceByNumber(
    @Param('id') orderId: string,
    @Param('number') number: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    await this.assertOwnership(orderId, user);
    const docs = await this.invoicing.listForOrder(orderId);
    // Se busca DENTRO de los documentos del pedido ya autorizado: así el número
    // que manda el cliente no puede servir para leer la factura de otro.
    const doc = docs.find((d) => d.number === number);
    if (!doc) {
      throw new NotFoundException('Documento no encontrado');
    }
    res.type('html').send(this.invoicing.renderHtml(doc));
  }

  // Pedido ajeno = inexistente (no revelamos que existe).
  private async assertOwnership(
    orderId: string,
    user: RequestUser,
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    if (!order || (user.role !== Role.ADMIN && order.userId !== user.userId)) {
      throw new NotFoundException('Factura no encontrada');
    }
  }
}
