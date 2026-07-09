import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditEntity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  assertCategoryExists,
  assertDiscountNotAbovePrice,
} from './catalog-support';
import { diffAuditableFields } from './audit.util';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  // Lectura por id, útil para poblar el formulario de edición del backoffice.
  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    return product;
  }

  async create(dto: CreateProductDto) {
    await assertCategoryExists(this.prisma, dto.categoryId);

    return this.prisma.product.create({
      data: {
        name: dto.name,
        description: dto.description,
        condition: dto.condition,
        priceCents: dto.priceCents,
        discountCents: dto.discountCents ?? 0,
        stock: dto.stock,
        categoryId: dto.categoryId,
        photos: dto.photos ?? [],
      },
    });
  }

  // `actorId` = id del admin autenticado (lo pasa el controller desde @CurrentUser).
  async update(id: string, dto: UpdateProductDto, actorId: string) {
    const current = await this.findOne(id);

    if (dto.categoryId) {
      await assertCategoryExists(this.prisma, dto.categoryId);
    }

    // En un PATCH parcial el DTO no puede comparar descuento y precio si solo llega
    // uno: re-comprobamos contra el valor persistido del otro.
    const nextPrice = dto.priceCents ?? current.priceCents;
    const nextDiscount = dto.discountCents ?? current.discountCents;
    assertDiscountNotAbovePrice(nextPrice, nextDiscount);

    const data = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.condition !== undefined && { condition: dto.condition }),
      ...(dto.priceCents !== undefined && { priceCents: dto.priceCents }),
      ...(dto.discountCents !== undefined && {
        discountCents: dto.discountCents,
      }),
      ...(dto.stock !== undefined && { stock: dto.stock }),
      ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
      ...(dto.photos !== undefined && { photos: dto.photos }),
    };

    // Transacción: el update de la entidad y las entradas de auditoría se confirman
    // o fallan juntos. Así es imposible cambiar precio/stock sin dejar traza
    // (requisito de CLAUDE.md). Releemos DENTRO de la transacción para comparar
    // contra el valor exacto en el momento de escribir.
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.product.findUniqueOrThrow({ where: { id } });
      const updated = await tx.product.update({ where: { id }, data });

      const changes = diffAuditableFields(before, updated);
      if (changes.length > 0) {
        await tx.auditLog.createMany({
          data: changes.map((change) => ({
            actorId,
            entityType: AuditEntity.PRODUCT,
            entityId: id,
            field: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
          })),
        });
      }

      return updated;
    });
  }

  // Borrado FÍSICO por ahora (lo más simple que no bloquea el futuro). En Fase 3,
  // cuando un producto pueda estar en pedidos/reservas, se revisará pasar a borrado
  // lógico (flag `active` o stock 0) para no perder el histórico de ventas.
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });
    return { id };
  }
}
