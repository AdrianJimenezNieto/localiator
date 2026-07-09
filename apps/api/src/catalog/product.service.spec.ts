import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ItemCondition } from '@prisma/client';
import { ProductService } from './product.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  product: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  category: { findUnique: jest.fn() },
  auditLog: { createMany: jest.fn() },
  $transaction: jest.fn(),
};

// Transacción interactiva: ejecutamos el callback pasándole el propio mock como
// `tx`, de modo que tx.product.update === prismaMock.product.update, etc. Se
// define fuera del literal para no crear una autorreferencia de tipo (que volvería
// `any` todo el mock).
type TxCallback = (tx: typeof prismaMock) => unknown;

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
    prismaMock.$transaction.mockImplementation((cb: TxCallback) =>
      cb(prismaMock),
    );
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
        service.update('p1', { discountCents: 6000 }, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.product.update).not.toHaveBeenCalled();
    });

    it('devuelve 404 si el producto no existe', async () => {
      prismaMock.product.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nope', { stock: 1 }, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('registra un AuditLog por cada campo auditable cambiado (precio + stock)', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'p1',
        priceCents: 5000,
        discountCents: 0,
        stock: 3,
      });
      // Valor "antes" leído dentro de la transacción.
      prismaMock.product.findUniqueOrThrow.mockResolvedValue({
        priceCents: 5000,
        discountCents: 0,
        stock: 3,
      });
      // Valor "después" que devuelve el update.
      prismaMock.product.update.mockResolvedValue({
        id: 'p1',
        priceCents: 6000,
        discountCents: 0,
        stock: 10,
      });

      await service.update('p1', { priceCents: 6000, stock: 10 }, 'admin-1');

      expect(prismaMock.auditLog.createMany).toHaveBeenCalledWith({
        data: [
          {
            actorId: 'admin-1',
            entityType: 'PRODUCT',
            entityId: 'p1',
            field: 'PRICE',
            oldValue: 5000,
            newValue: 6000,
          },
          {
            actorId: 'admin-1',
            entityType: 'PRODUCT',
            entityId: 'p1',
            field: 'STOCK',
            oldValue: 3,
            newValue: 10,
          },
        ],
      });
    });

    it('no registra auditoría si no cambia ningún campo auditable', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'p1',
        priceCents: 5000,
        discountCents: 0,
        stock: 3,
      });
      prismaMock.product.findUniqueOrThrow.mockResolvedValue({
        priceCents: 5000,
        discountCents: 0,
        stock: 3,
      });
      prismaMock.product.update.mockResolvedValue({
        id: 'p1',
        priceCents: 5000,
        discountCents: 0,
        stock: 3,
      });

      await service.update('p1', { name: 'Nuevo nombre' }, 'admin-1');

      expect(prismaMock.auditLog.createMany).not.toHaveBeenCalled();
    });
  });
});
