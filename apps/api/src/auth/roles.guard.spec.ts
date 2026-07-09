import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

// Construye un ExecutionContext mínimo con el usuario indicado en req.user.
function contextWith(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  function makeGuard(requiredRoles: Role[] | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('permite si la ruta no exige roles (solo autenticación)', () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(contextWith({ role: 'BUYER' }))).toBe(true);
  });

  it('permite si el rol del usuario está entre los requeridos', () => {
    const guard = makeGuard([Role.ADMIN]);
    expect(guard.canActivate(contextWith({ role: 'ADMIN' }))).toBe(true);
  });

  it('deniega (→403) si el rol del usuario no basta', () => {
    const guard = makeGuard([Role.ADMIN]);
    expect(guard.canActivate(contextWith({ role: 'BUYER' }))).toBe(false);
  });

  it('deniega si no hay usuario en la petición', () => {
    const guard = makeGuard([Role.ADMIN]);
    expect(guard.canActivate(contextWith(undefined))).toBe(false);
  });
});
