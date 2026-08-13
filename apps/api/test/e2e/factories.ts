import { AuctionStatus, OrderItemType, Role } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';

// Factorías de datos para los e2e: crean filas reales en la BD de test con lo
// mínimo imprescindible y valores por defecto sensatos, para que cada test declare
// solo lo que le importa (el precio de salida, el estado de la subasta…) y no
// quince campos de ruido.

let counter = 0;
// Los emails son @unique y la BD se vacía entre tests, pero dentro de un mismo
// test se crean varios usuarios: basta un contador de proceso para no chocar.
function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}-${process.pid}@e2e.localiator.test`;
}

export interface TestUser {
  id: string;
  email: string;
  role: string;
}

// Usuario que PUEDE pujar: email verificado y sin ban. Son los dos requisitos que
// comprueba AuctionsService.assertCanBid, así que un usuario creado a pelo sin
// `emailVerifiedAt` vería sus pujas rechazadas y el test fallaría por un motivo
// que no es el que se está probando.
export async function createBuyer(
  prisma: PrismaService,
  overrides: { emailVerified?: boolean; banned?: boolean } = {},
): Promise<TestUser> {
  const { emailVerified = true, banned = false } = overrides;
  const user = await prisma.user.create({
    data: {
      email: uniqueEmail('buyer'),
      role: Role.BUYER,
      emailVerifiedAt: emailVerified ? new Date() : null,
      bannedAt: banned ? new Date() : null,
      banReason: banned ? 'Impago (e2e)' : null,
    },
    select: { id: true, email: true, role: true },
  });
  return user;
}

// Subasta EN CURSO y lejos de su cierre. El `endsAt` a una hora vista es
// deliberado: mantiene la puja fuera de la ventana de antisniping, de modo que un
// test que no va de antisniping no recibe un `auction:extended` inesperado. Los
// tests de antisniping acercan el `endsAt` a propósito.
//
// `itemId` es un id lógico sin FK real (ver el enum del esquema), así que no hace
// falta crear un Product/Lot para poder subastar.
export async function createLiveAuction(
  prisma: PrismaService,
  overrides: Partial<{
    startingPriceCents: number;
    minIncrementCents: number;
    startsAt: Date;
    endsAt: Date;
    status: AuctionStatus;
  }> = {},
): Promise<{
  id: string;
  startingPriceCents: number;
  minIncrementCents: number;
}> {
  const now = Date.now();
  const auction = await prisma.auction.create({
    data: {
      itemType: OrderItemType.PRODUCT,
      itemId: `e2e-item-${(counter += 1)}`,
      startingPriceCents: overrides.startingPriceCents ?? 10_000,
      minIncrementCents: overrides.minIncrementCents ?? 500,
      startsAt: overrides.startsAt ?? new Date(now - 60 * 60 * 1000),
      endsAt: overrides.endsAt ?? new Date(now + 60 * 60 * 1000),
      status: overrides.status ?? AuctionStatus.LIVE,
    },
    select: {
      id: true,
      startingPriceCents: true,
      minIncrementCents: true,
    },
  });
  return auction;
}
