import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  oAuthAccount: { deleteMany: jest.fn() },
  verificationToken: { deleteMany: jest.fn() },
  refreshToken: { updateMany: jest.fn() },
  invoice: { findMany: jest.fn() },
  // El service usa $transaction con un ARRAY de promesas; el mock las resuelve
  // todas, igual que Prisma.
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};

// expect.any devuelve `any`; lo tipamos como unknown para no disparar el lint de
// asignaciones inseguras dentro de los objetos esperados (patrón del repo).
const anyDate = expect.any(Date) as unknown;

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((ops: unknown[]) =>
      Promise.all(ops),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  describe('anonymizeOwnAccount', () => {
    it('anonimiza el usuario: email neutro, sin contraseña y con anonymizedAt', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'real@correo.dev',
        passwordHash: 'hash',
        anonymizedAt: null,
      });

      await service.anonymizeOwnAccount('u1');

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          email: 'borrado+u1@localiator.invalid',
          passwordHash: null,
          emailVerifiedAt: null,
          anonymizedAt: anyDate,
        },
      });
    });

    it('borra las cuentas OAuth y revoca los refresh tokens activos', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        anonymizedAt: null,
      });

      await service.anonymizeOwnAccount('u1');

      expect(prismaMock.oAuthAccount.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: anyDate },
      });
    });

    it('NO toca las facturas (se conservan por deber fiscal)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        anonymizedAt: null,
      });

      await service.anonymizeOwnAccount('u1');

      // El service no debe borrar ni modificar facturas en ningún momento.
      expect(prismaMock.invoice.findMany).not.toHaveBeenCalled();
    });

    it('es idempotente: si ya está anonimizada, no vuelve a actualizar', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        anonymizedAt: new Date(),
      });

      await service.anonymizeOwnAccount('u1');

      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('lanza NotFound si el usuario no existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.anonymizeOwnAccount('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
