import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ItemCondition } from '@prisma/client';
import { ProductService } from './product.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  product: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  category: { findUnique: jest.fn() },
};

const baseDto = {
  name: 'Taladro',
  description: 'Taladro percutor',
  condition: ItemCondition.GOOD,
  priceCents: 5000,
  discountCents: 500,
  stock: 3,
  categoryId: 'cat-1',
};

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(ProductService);
  });

  describe('create', () => {
    it('crea el producto cuando la categoría existe', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
      prismaMock.product.create.mockResolvedValue({ id: 'p1' });

      await service.create(baseDto);

      expect(prismaMock.product.create).toHaveBeenCalledWith({
        data: {
          name: 'Taladro',
          description: 'Taladro percutor',
          condition: ItemCondition.GOOD,
          priceCents: 5000,
          discountCents: 500,
          stock: 3,
          categoryId: 'cat-1',
          photos: [],
        },
      });
    });

    it('aplica descuento 0 y fotos [] por defecto', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
      prismaMock.product.create.mockResolvedValue({ id: 'p1' });

      // Alta sin descuento ni fotos: deben quedar en 0 y [] respectivamente.
      await service.create({
        name: 'Martillo',
        description: 'Martillo de carpintero',
        condition: ItemCondition.NEW,
        priceCents: 1200,
        stock: 10,
        categoryId: 'cat-1',
      });

      expect(prismaMock.product.create).toHaveBeenCalledWith({
        data: {
          name: 'Martillo',
          description: 'Martillo de carpintero',
          condition: ItemCondition.NEW,
          priceCents: 1200,
          discountCents: 0,
          stock: 10,
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
      expect(prismaMock.product.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('rechaza con 400 si el descuento resultante supera el precio persistido', async () => {
      // Solo se cambia el descuento; el precio viejo (5000) manda.
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'p1',
        priceCents: 5000,
        discountCents: 0,
      });

      await expect(
        service.update('p1', { discountCents: 6000 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.product.update).not.toHaveBeenCalled();
    });

    it('devuelve 404 si el producto no existe', async () => {
      prismaMock.product.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', { stock: 1 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
