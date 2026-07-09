import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { VerificationTokenType } from '@prisma/client';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from './session.service';
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
  oAuthAccount: { findUnique: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};
const mailMock = {
  sendEmailVerification: jest.fn(),
  sendPasswordReset: jest.fn(),
};
const passwordMock = { hash: jest.fn(), verify: jest.fn() };
const sessionMock = { revokeAllForUser: jest.fn() };

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
        { provide: SessionService, useValue: sessionMock },
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

  describe('login', () => {
    beforeEach(() => {
      // El constructor calcula el hash señuelo con password.hash: le damos valor.
      passwordMock.hash.mockResolvedValue('dummy');
    });

    it('devuelve el usuario autenticado con credenciales correctas', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        passwordHash: 'stored',
        role: 'BUYER',
        emailVerifiedAt: new Date(),
      });
      passwordMock.verify.mockResolvedValue(true);

      const res = await service.login({
        email: 'A@B.com',
        password: 'password123',
      });

      expect(passwordMock.verify).toHaveBeenCalledWith('stored', 'password123');
      expect(res).toEqual({
        id: 'u1',
        email: 'a@b.com',
        role: 'BUYER',
        emailVerified: true,
      });
    });

    it('rechaza contraseña incorrecta con 401 genérico', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        passwordHash: 'stored',
        role: 'BUYER',
        emailVerifiedAt: null,
      });
      passwordMock.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: 'a@b.com', password: 'bad' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('verifica contra el hash señuelo cuando el email no existe (defensa de timing)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      passwordMock.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: 'x@y.com', password: 'whatever12' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      // Aunque no haya usuario, SIEMPRE se ejecuta un verify (contra el señuelo).
      expect(passwordMock.verify).toHaveBeenCalledTimes(1);
    });

    it('rechaza a un usuario solo-Google (sin contraseña local)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        passwordHash: null,
        role: 'BUYER',
        emailVerifiedAt: new Date(),
      });
      passwordMock.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: 'a@b.com', password: 'whatever12' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('validateOAuthLogin (Google)', () => {
    const input = {
      provider: 'google',
      providerAccountId: 'sub-123',
      email: 'G@Mail.com',
    };

    it('hace login directo si el OAuthAccount ya existe', async () => {
      prismaMock.oAuthAccount.findUnique.mockResolvedValue({
        user: {
          id: 'u1',
          email: 'g@mail.com',
          role: 'BUYER',
          emailVerifiedAt: new Date(),
        },
      });

      const res = await service.validateOAuthLogin(input);

      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(prismaMock.oAuthAccount.create).not.toHaveBeenCalled();
      expect(res.id).toBe('u1');
    });

    it('vincula al usuario existente por email (no duplica cuenta)', async () => {
      prismaMock.oAuthAccount.findUnique.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u2',
        email: 'g@mail.com',
        role: 'BUYER',
        emailVerifiedAt: new Date(),
      });

      const res = await service.validateOAuthLogin(input);

      expect(prismaMock.oAuthAccount.create).toHaveBeenCalledWith({
        data: {
          provider: 'google',
          providerAccountId: 'sub-123',
          userId: 'u2',
        },
      });
      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(res.id).toBe('u2');
    });

    it('crea usuario verificado y su OAuthAccount si no existe ninguno', async () => {
      prismaMock.oAuthAccount.findUnique.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'u3',
        email: 'g@mail.com',
        role: 'BUYER',
        emailVerifiedAt: new Date(),
      });

      const res = await service.validateOAuthLogin(input);

      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          email: 'g@mail.com', // normalizado a minúsculas
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any es `any` por diseño
          emailVerifiedAt: expect.any(Date), // Google ya lo verificó
          oauthAccounts: {
            create: { provider: 'google', providerAccountId: 'sub-123' },
          },
        },
      });
      expect(res.emailVerified).toBe(true);
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

  describe('forgotPassword', () => {
    it('genera token y envía email si el usuario existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' });
      prismaMock.verificationToken.create.mockResolvedValue({});

      const res = await service.forgotPassword('A@B.com');

      expect(prismaMock.verificationToken.create).toHaveBeenCalledTimes(1);
      expect(mailMock.sendPasswordReset).toHaveBeenCalledTimes(1);
      expect(res.message).toContain('Si el email');
    });

    it('respuesta neutra sin enviar nada si el usuario no existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const res = await service.forgotPassword('nope@b.com');

      expect(prismaMock.verificationToken.create).not.toHaveBeenCalled();
      expect(mailMock.sendPasswordReset).not.toHaveBeenCalled();
      // Mismo mensaje que si existiera: no se distingue.
      expect(res.message).toContain('Si el email');
    });
  });

  describe('resetPassword', () => {
    const validToken = {
      id: 't1',
      userId: 'u1',
      type: VerificationTokenType.PASSWORD_RESET,
      usedAt: null,
      expiresAt: new Date(Date.now() + 10000),
    };

    it('actualiza la contraseña, invalida el token y revoca sesiones', async () => {
      prismaMock.verificationToken.findUnique.mockResolvedValue(validToken);
      passwordMock.hash.mockResolvedValue('newhash');
      prismaMock.$transaction.mockResolvedValue([]);

      const res = await service.resetPassword('raw', 'newpassword1');

      expect(passwordMock.hash).toHaveBeenCalledWith('newpassword1');
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(sessionMock.revokeAllForUser).toHaveBeenCalledWith('u1');
      expect(res.message).toContain('actualizada');
    });

    it('rechaza un token de tipo equivocado (p.ej. verificación de email)', async () => {
      prismaMock.verificationToken.findUnique.mockResolvedValue({
        ...validToken,
        type: VerificationTokenType.EMAIL_VERIFICATION,
      });
      await expect(
        service.resetPassword('raw', 'newpassword1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(sessionMock.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('rechaza un token caducado', async () => {
      prismaMock.verificationToken.findUnique.mockResolvedValue({
        ...validToken,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.resetPassword('raw', 'newpassword1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
