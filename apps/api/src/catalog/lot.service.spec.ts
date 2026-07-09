import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ItemCondition } from '@prisma/client';
import { LotService } from './lot.service';
import { PrismaService } from '../prisma/prisma.service';

// Tests espejo de los de producto: mismas garantías sobre la entidad Lot.
const prismaMock = {
  lot: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  category: { findUnique: jest.fn() },
};

const baseDto = {
  name: 'Palé de electrónica',
  description: 'Lote mixto de devoluciones',
  condition: ItemCondition.FAIR,
  priceCents: 20000,
  discountCents: 2000,
  stock: 1,
  categoryId: 'cat-1',
};

describe('LotService', () => {
  let service: LotService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [LotService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(LotService);
  });

  it('crea el lote cuando la categoría existe', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.lot.create.mockResolvedValue({ id: 'l1' });

    await service.create(baseDto);

    expect(prismaMock.lot.create).toHaveBeenCalledWith({
      data: {
        name: 'Palé de electrónica',
        description: 'Lote mixto de devoluciones',
        condition: ItemCondition.FAIR,
        priceCents: 20000,
        discountCents: 2000,
        stock: 1,
        categoryId: 'cat-1',
        photos: [],
      },
    });
  });

  it('rechaza con 400 si la categoría no existe', async () => {
    prismaMock.category.findUnique.mockResolvedValue(null);

    await expect(service.create(baseDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prismaMock.lot.create).not.toHaveBeenCalled();
  });

  it('rechaza con 400 si el descuento del PATCH supera el precio persistido', async () => {
    prismaMock.lot.findUnique.mockResolvedValue({
      id: 'l1',
      priceCents: 20000,
      discountCents: 0,
    });

    await expect(
      service.update('l1', { discountCents: 25000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.lot.update).not.toHaveBeenCalled();
  });

  it('devuelve 404 si el lote no existe', async () => {
    prismaMock.lot.findUnique.mockResolvedValue(null);

    await expect(service.findOne('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
