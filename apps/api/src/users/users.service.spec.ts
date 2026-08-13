import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';

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
          firstName: null,
          lastName: null,
          birthDate: null,
          phone: null,
          taxId: null,
          addressLine1: null,
          addressLine2: null,
          postalCode: null,
          city: null,
          province: null,
          country: null,
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

  describe('isProfileComplete', () => {
    it('es true cuando todos los campos obligatorios están rellenos', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        firstName: 'Ana',
        lastName: 'Gómez',
        birthDate: new Date('1990-01-01'),
        addressLine1: 'Calle Falsa 123',
        postalCode: '28080',
        city: 'Madrid',
        province: 'Madrid',
        country: 'ES',
      });

      await expect(service.isProfileComplete('u1')).resolves.toBe(true);
    });

    it('es false si falta algún campo obligatorio (típico de una cuenta de Google)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        firstName: null,
        lastName: null,
        birthDate: null,
        addressLine1: null,
        postalCode: null,
        city: null,
        province: null,
        country: 'ES',
      });

      await expect(service.isProfileComplete('u1')).resolves.toBe(false);
    });

    it('es false si el usuario no existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.isProfileComplete('missing')).resolves.toBe(false);
    });
  });

  describe('updateOwnProfile', () => {
    const dto: UpdateProfileDto = {
      firstName: 'Ana',
      lastName: 'Gómez',
      birthDate: '1990-01-01',
      addressLine1: 'Calle Falsa 123',
      postalCode: '28080',
      city: 'Madrid',
      province: 'Madrid',
      country: 'ES',
    };

    it('actualiza el perfil convirtiendo birthDate a Date', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        anonymizedAt: null,
      });

      await service.updateOwnProfile('u1', dto);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { ...dto, birthDate: new Date('1990-01-01') },
        select: { id: true },
      });
    });

    it('rechaza si la cuenta está anonimizada (derecho al olvido)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        anonymizedAt: new Date(),
      });

      await expect(service.updateOwnProfile('u1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('lanza NotFound si el usuario no existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.updateOwnProfile('missing', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
