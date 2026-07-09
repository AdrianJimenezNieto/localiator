import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import {
  assertCategoryExists,
  assertDiscountNotAbovePrice,
} from './catalog-support';

// Espejo de ProductService. Se replica a propósito (Product y Lot son entidades
// independientes); solo se comparten las validaciones puras de catalog-support.
@Injectable()
export class LotService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    const lot = await this.prisma.lot.findUnique({ where: { id } });
    if (!lot) {
      throw new NotFoundException('Lote no encontrado');
    }
    return lot;
  }

  async create(dto: CreateLotDto) {
    await assertCategoryExists(this.prisma, dto.categoryId);

    return this.prisma.lot.create({
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

  async update(id: string, dto: UpdateLotDto) {
    const current = await this.findOne(id);

    if (dto.categoryId) {
      await assertCategoryExists(this.prisma, dto.categoryId);
    }

    const nextPrice = dto.priceCents ?? current.priceCents;
    const nextDiscount = dto.discountCents ?? current.discountCents;
    assertDiscountNotAbovePrice(nextPrice, nextDiscount);

    return this.prisma.lot.update({
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

  // Borrado físico por ahora, igual que producto (revisar soft-delete en Fase 3).
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.lot.delete({ where: { id } });
    return { id };
  }
}
