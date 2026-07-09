import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  assertCategoryExists,
  assertDiscountNotAbovePrice,
} from './catalog-support';

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

  async update(id: string, dto: UpdateProductDto) {
    const current = await this.findOne(id);

    if (dto.categoryId) {
      await assertCategoryExists(this.prisma, dto.categoryId);
    }

    // En un PATCH parcial el DTO no puede comparar descuento y precio si solo llega
    // uno: re-comprobamos contra el valor persistido del otro.
    const nextPrice = dto.priceCents ?? current.priceCents;
    const nextDiscount = dto.discountCents ?? current.discountCents;
    assertDiscountNotAbovePrice(nextPrice, nextDiscount);

    return this.prisma.product.update({
      where: { id },
      data: {
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
      },
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
