import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { VerificationTokenType } from '@prisma/client';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

// Mock de Prisma: solo los métodos que toca el servicio. Así los tests no
// necesitan una BD real y corren en CI sin migraciones.
const prismaMock = {
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  verificationToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};
const mailMock = {
  sendEmailVerification: jest.fn(),
  sendPasswordReset: jest.fn(),
};
const passwordMock = { hash: jest.fn(), verify: jest.fn() };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MailService, useValue: mailMock },
        { provide: PasswordService, useValue: passwordMock },
        {
          provide: ConfigService,
          useValue: { get: () => 'http://localhost:5173' },
        },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('crea usuario no verificado y envía email cuando el email es nuevo', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      passwordMock.hash.mockResolvedValue('hashed');
      prismaMock.user.create.mockResolvedValue({ id: 'u1' });
      prismaMock.verificationToken.create.mockResolvedValue({});

      const res = await service.register({
        email: 'A@B.com',
        password: 'password123',
      });

      expect(passwordMock.hash).toHaveBeenCalledWith('password123');
      // Email normalizado a minúsculas y sin passwordHash en claro.
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          email: 'a@b.com',
          passwordHash: 'hashed',
          emailVerifiedAt: null,
        },
      });
      expect(mailMock.sendEmailVerification).toHaveBeenCalledTimes(1);
      expect(res.message).toContain('Si el email');
    });

    it('respuesta neutra sin crear ni enviar si el email ya existe (anti-enumeración)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'existing' });

      const res = await service.register({
        email: 'a@b.com',
        password: 'password123',
      });

      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(mailMock.sendEmailVerification).not.toHaveBeenCalled();
      // Mismo mensaje que el caso "nuevo": no se distingue desde fuera.
      expect(res.message).toContain('Si el email');
    });
  });

  describe('verifyEmail', () => {
    it('verifica la cuenta e invalida el token cuando es válido', async () => {
      prismaMock.verificationToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        type: VerificationTokenType.EMAIL_VERIFICATION,
        usedAt: null,
        expiresAt: new Date(Date.now() + 10000),
      });
      prismaMock.$transaction.mockResolvedValue([]);

      const res = await service.verifyEmail('raw-token');

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(res.message).toContain('verificado');
    });

    it('rechaza un token inexistente', async () => {
      prismaMock.verificationToken.findUnique.mockResolvedValue(null);
      await expect(service.verifyEmail('x')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza un token caducado', async () => {
      prismaMock.verificationToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        type: VerificationTokenType.EMAIL_VERIFICATION,
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.verifyEmail('x')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza un token ya usado', async () => {
      prismaMock.verificationToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        type: VerificationTokenType.EMAIL_VERIFICATION,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 10000),
      });
      await expect(service.verifyEmail('x')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
