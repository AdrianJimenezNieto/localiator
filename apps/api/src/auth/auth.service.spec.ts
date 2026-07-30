import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
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
  sendPasswordChangedNotice: jest.fn(),
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
    // Payload de registro válido reutilizable: además de credenciales, los datos
    // personales que ahora exige el DTO. Los tests lo clonan y ajustan lo que toque.
    const validRegister = {
      email: 'A@B.com',
      password: 'password123',
      firstName: '  Ada  ',
      lastName: '  Lovelace  ',
      birthDate: '1990-05-10',
      phone: '  600123123  ',
      addressLine1: '  Calle Mayor 1  ',
      addressLine2: '',
      postalCode: '28001',
      city: '  Madrid  ',
      province: '  Madrid  ',
      country: 'ES',
    };

    it('crea usuario no verificado con sus datos y envía email cuando el email es nuevo', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      passwordMock.hash.mockResolvedValue('hashed');
      prismaMock.user.create.mockResolvedValue({ id: 'u1' });
      prismaMock.verificationToken.create.mockResolvedValue({});

      const res = await service.register(validRegister);

      expect(passwordMock.hash).toHaveBeenCalledWith('password123');
      // Email en minúsculas, datos personales saneados (trim) y campos opcionales
      // vacíos normalizados a null.
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          email: 'a@b.com',
          passwordHash: 'hashed',
          emailVerifiedAt: null,
          firstName: 'Ada',
          lastName: 'Lovelace',
          birthDate: new Date('1990-05-10'),
          phone: '600123123',
          addressLine1: 'Calle Mayor 1',
          addressLine2: null,
          postalCode: '28001',
          city: 'Madrid',
          province: 'Madrid',
          country: 'ES',
        },
      });
      expect(mailMock.sendEmailVerification).toHaveBeenCalledTimes(1);
      expect(res.message).toContain('Si el email');
    });

    it('respuesta neutra sin crear ni enviar si el email ya existe (anti-enumeración)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'existing' });

      const res = await service.register(validRegister);

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

    it('permite login sin verificar dentro del día de gracia', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        passwordHash: 'stored',
        role: 'BUYER',
        emailVerifiedAt: null,
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // hace 1 h
      });
      passwordMock.verify.mockResolvedValue(true);

      const res = await service.login({
        email: 'a@b.com',
        password: 'password123',
      });

      expect(res.emailVerified).toBe(false);
    });

    it('bloquea el login sin verificar pasado el día de gracia', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        passwordHash: 'stored',
        role: 'BUYER',
        emailVerifiedAt: null,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // hace 2 días
      });
      passwordMock.verify.mockResolvedValue(true);

      await expect(
        service.login({ email: 'a@b.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('resendVerification', () => {
    it('emite un nuevo token si la cuenta existe y no está verificada', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        emailVerifiedAt: null,
      });
      prismaMock.verificationToken.create.mockResolvedValue({});

      const res = await service.resendVerification('A@B.com');

      expect(prismaMock.verificationToken.create).toHaveBeenCalledTimes(1);
      expect(mailMock.sendEmailVerification).toHaveBeenCalledTimes(1);
      expect(res.message).toContain('Si tu cuenta');
    });

    it('no envía nada si la cuenta ya está verificada (respuesta neutra)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        emailVerifiedAt: new Date(),
      });

      const res = await service.resendVerification('a@b.com');

      expect(mailMock.sendEmailVerification).not.toHaveBeenCalled();
      expect(res.message).toContain('Si tu cuenta');
    });

    it('no envía nada si la cuenta no existe (respuesta neutra, anti-enumeración)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const res = await service.resendVerification('nope@b.com');

      expect(mailMock.sendEmailVerification).not.toHaveBeenCalled();
      expect(res.message).toContain('Si tu cuenta');
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

  describe('changePassword', () => {
    const localUser = {
      id: 'u1',
      email: 'a@b.com',
      passwordHash: 'stored',
      role: 'BUYER',
      emailVerifiedAt: new Date(),
    };

    it('actualiza el hash y devuelve el usuario cuando la contraseña actual es correcta', async () => {
      prismaMock.user.findUnique.mockResolvedValue(localUser);
      passwordMock.verify.mockResolvedValue(true);
      passwordMock.hash.mockResolvedValue('newhash');
      prismaMock.user.update.mockResolvedValue({});

      const res = await service.changePassword(
        'u1',
        'Current-1!',
        'NewPass-1!',
      );

      expect(passwordMock.verify).toHaveBeenCalledWith('stored', 'Current-1!');
      expect(passwordMock.hash).toHaveBeenCalledWith('NewPass-1!');
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { passwordHash: 'newhash' },
      });
      expect(res).toEqual({
        id: 'u1',
        email: 'a@b.com',
        role: 'BUYER',
        emailVerified: true,
      });
    });

    it('rechaza con 401 si la contraseña actual es incorrecta (sin actualizar nada)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(localUser);
      passwordMock.verify.mockResolvedValue(false);

      await expect(
        service.changePassword('u1', 'wrong', 'NewPass-1!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('remite al reset si la cuenta es solo-Google (sin contraseña local)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...localUser,
        passwordHash: null,
      });

      await expect(
        service.changePassword('u1', 'whatever', 'NewPass-1!'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(passwordMock.verify).not.toHaveBeenCalled();
    });

    it('rechaza si la nueva contraseña coincide con la actual', async () => {
      prismaMock.user.findUnique.mockResolvedValue(localUser);
      passwordMock.verify.mockResolvedValue(true);

      await expect(
        service.changePassword('u1', 'Same-pass-1!', 'Same-pass-1!'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('no rompe si el aviso por email falla (best-effort)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(localUser);
      passwordMock.verify.mockResolvedValue(true);
      passwordMock.hash.mockResolvedValue('newhash');
      prismaMock.user.update.mockResolvedValue({});
      mailMock.sendPasswordChangedNotice.mockRejectedValue(new Error('down'));

      const res = await service.changePassword(
        'u1',
        'Current-1!',
        'NewPass-1!',
      );

      expect(res.id).toBe('u1');
    });
  });
});
