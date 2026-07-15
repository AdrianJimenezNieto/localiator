/* eslint-disable @typescript-eslint/unbound-method --
 * Aquí los métodos del controlador se pasan SIN invocar y a propósito: son la
 * clave con la que el Reflector busca los metadatos que dejaron @Public()/@Roles,
 * igual que hacen los guards reales con context.getHandler(). Nunca se llaman, así
 * que el `this` suelto que previene la regla no puede darse. */
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AuctionsController } from './auctions.controller';
import { RolesGuard } from '../auth/roles.guard';
import { IS_PUBLIC_KEY } from '../auth/auth.constants';
import { RequestUser } from '../auth/jwt.strategy';

// Contexto mínimo que necesitan los guards: a qué handler y clase apunta la
// petición, y qué usuario trae (undefined = invitado, como lo deja JwtAuthGuard
// en una ruta @Public()).
function contextFor(
  handler: (...args: never[]) => unknown,
  user?: RequestUser,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => AuctionsController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

// Estos tests ejercitan el RolesGuard REAL contra los metadatos REALES del
// controlador, en vez de leer el código y confiar. Existen por una trampa concreta:
// RolesGuard NO mira @Public(), así que si AuctionsController volviera a llevar
// @Roles(BUYER, ADMIN) a nivel de clase, el listado público devolvería 403 a los
// invitados (JwtAuthGuard deja `req.user` vacío en rutas públicas y el guard exige
// un rol). Si alguien lo reintroduce, el primer test se pone rojo.
describe('AuctionsController · acceso', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  describe('listado público (tarea 12)', () => {
    it('está marcado como @Public()', () => {
      const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        AuctionsController.prototype.list,
        AuctionsController,
      ]);
      expect(isPublic).toBe(true);
    });

    it('deja pasar a un invitado (sin usuario autenticado)', () => {
      const context = contextFor(AuctionsController.prototype.list);
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('pujar', () => {
    it('rechaza a un invitado', () => {
      const context = contextFor(AuctionsController.prototype.placeBid);
      expect(guard.canActivate(context)).toBe(false);
    });

    it('deja pujar a un comprador', () => {
      const context = contextFor(AuctionsController.prototype.placeBid, {
        userId: 'user-1',
        role: Role.BUYER,
      } as RequestUser);
      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
