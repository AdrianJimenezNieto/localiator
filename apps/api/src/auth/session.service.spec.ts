import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SessionService } from './session.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};
const jwtMock = { signAsync: jest.fn() };
const configMock = {
  get: (key: string) => (key === 'ACCESS_TOKEN_TTL' ? '15m' : '15d'),
};

const user = { id: 'u1', email: 'a@b.com', role: 'BUYER', emailVerified: true };
// expect.any devuelve `any`; lo tipamos como unknown para no disparar el lint de
// asignaciones inseguras dentro de los objetos esperados.
const anyDate = expect.any(Date) as unknown;
const userRow = {
  id: 'u1',
  email: 'a@b.com',
  role: 'BUYER',
  emailVerifiedAt: new Date(),
};

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jwtMock.signAsync.mockResolvedValue('access-token');
    const moduleRef = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();
    service = moduleRef.get(SessionService);
  });

  it('issue crea un refresh token en BD y firma el access token', async () => {
    prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt1' });

    const session = await service.issue(user);

    expect(session.accessToken).toBe('access-token');
    expect(typeof session.refreshToken).toBe('string');
    // La caducidad del refresh es futura (base del sliding de la tarea 10).
    expect(session.refreshExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('rotate revoca el token usado y emite uno nuevo', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
      user: userRow,
    });
    prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt2' });

    const session = await service.rotate('raw-token');

    expect(session.accessToken).toBe('access-token');
    // El anterior queda revocado y apunta al nuevo (traza de rotación).
    expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt1' },
      data: { revokedAt: anyDate, replacedByTokenId: 'rt2' },
    });
  });

  it('rotate detecta reutilización: token ya revocado → revoca todas las sesiones', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      revokedAt: new Date(), // ya estaba revocado: señal de robo
      expiresAt: new Date(Date.now() + 100000),
      user: userRow,
    });

    await expect(service.rotate('stolen')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: anyDate },
    });
  });

  it('rotate rechaza un refresh caducado', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000), // caducado
      user: userRow,
    });

    await expect(service.rotate('old')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rotate rechaza un token inexistente', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);
    await expect(service.rotate('nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
