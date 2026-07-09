import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { CategoryService } from './category.service';
import { PrismaService } from '../prisma/prisma.service';

// Mock de Prisma: solo los métodos que toca el service, para no depender de una BD
// real (mismo patrón que los tests de auth).
const prismaMock = {
  category: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  product: { count: jest.fn() },
  lot: { count: jest.fn() },
};

// Helper para simular la colisión de @unique de Prisma (P2002).
function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('CategoryService', () => {
  let service: CategoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(CategoryService);
  });

  describe('create', () => {
    it('autogenera el slug a partir del nombre si no se indica', async () => {
      prismaMock.category.create.mockResolvedValue({ id: 'c1' });

      await service.create({ name: 'Electrónica de Hogar' });

      expect(prismaMock.category.create).toHaveBeenCalledWith({
        data: {
          name: 'Electrónica de Hogar',
          slug: 'electronica-de-hogar',
          parentId: null,
        },
      });
    });

    it('devuelve 409 si el slug ya existe', async () => {
      prismaMock.category.create.mockRejectedValue(uniqueViolation());

      await expect(service.create({ name: 'Hogar' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rechaza con 400 si el padre indicado no existe', async () => {
      prismaMock.category.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Sub', parentId: 'missing' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.category.create).not.toHaveBeenCalled();
    });

    it('rechaza con 400 si el nombre no produce un slug válido', async () => {
      await expect(service.create({ name: '!!!' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('bloquea el borrado si la categoría tiene artículos asociados', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ id: 'c1' });
      prismaMock.product.count.mockResolvedValue(2);
      prismaMock.lot.count.mockResolvedValue(0);

      await expect(service.remove('c1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prismaMock.category.delete).not.toHaveBeenCalled();
    });

    it('borra si no tiene artículos asociados', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ id: 'c1' });
      prismaMock.product.count.mockResolvedValue(0);
      prismaMock.lot.count.mockResolvedValue(0);

      await expect(service.remove('c1')).resolves.toEqual({ id: 'c1' });
      expect(prismaMock.category.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
    });

    it('devuelve 404 si la categoría no existe', async () => {
      prismaMock.category.findUnique.mockResolvedValue(null);

      await expect(service.remove('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
