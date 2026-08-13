import {
  TestApp,
  createTestApp,
  resetDatabase,
  signAccessToken,
} from './harness';
import { connectAuctionSocket, joinAuction, TestSocket } from './socket-client';
import { createBuyer, createLiveAuction } from './factories';

// Tests de EJEMPLO del canal en vivo de subastas. Son dos a propósito: uno del
// camino feliz (el evento llega) y otro de una propiedad de aislamiento (el evento
// NO llega a quien no debe). Entre los dos queda demostrado el andamiaje completo:
// app real, BD real, sockets reales, rooms reales.
//
// Levantar la app cuesta unos segundos, así que se hace UNA vez por fichero
// (beforeAll) y lo que se limpia entre tests es la BD (beforeEach). Los sockets,
// en cambio, se crean y cierran en cada test: un socket que sobreviviera al test
// seguiría en su room y recibiría eventos del siguiente.
describe('AuctionsGateway (e2e)', () => {
  let ctx: TestApp;
  const sockets: TestSocket[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
  });

  afterEach(() => {
    sockets.splice(0).forEach((s) => s.close());
  });

  // Abre un socket ya autenticado como `user` y lo registra para cerrarlo al final
  // del test.
  async function connectAs(user: {
    id: string;
    email: string;
    role: string;
  }): Promise<TestSocket> {
    const socket = await connectAuctionSocket(ctx.port, {
      token: signAccessToken(ctx.app, user),
    });
    sockets.push(socket);
    return socket;
  }

  it('difunde una puja aceptada a todos los que miran la subasta', async () => {
    const bidder = await createBuyer(ctx.prisma);
    const observer = await createBuyer(ctx.prisma);
    const auction = await createLiveAuction(ctx.prisma, {
      startingPriceCents: 10_000,
    });

    const bidderSocket = await connectAs(bidder);
    const observerSocket = await connectAs(observer);
    await joinAuction(bidderSocket, auction.id);
    await joinAuction(observerSocket, auction.id);

    bidderSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: 10_000,
    });

    // El que puja recibe su confirmación privada...
    await bidderSocket.waitFor('bid:accepted:self');

    // ...y CUALQUIERA que esté en la room ve el nuevo precio, con el pujador
    // enmascarado (RGPD): nunca el email ni el id del que va ganando.
    const broadcast = await observerSocket.waitFor<{
      amountCents: number;
      userMasked: string;
    }>('bid:accepted');
    expect(broadcast.amountCents).toBe(10_000);
    expect(broadcast.userMasked).not.toContain(bidder.email);
    expect(broadcast.userMasked).not.toContain(bidder.id);

    // Y la puja está de verdad en la BD: el evento no es un eco vacío.
    const stored = await ctx.prisma.bid.findFirst({
      where: { auctionId: auction.id },
    });
    expect(stored).toMatchObject({ userId: bidder.id, amountCents: 10_000 });
  });

  it('manda el aviso de "te han superado" solo al superado, no a la room', async () => {
    const first = await createBuyer(ctx.prisma);
    const second = await createBuyer(ctx.prisma);
    const auction = await createLiveAuction(ctx.prisma, {
      startingPriceCents: 10_000,
      minIncrementCents: 500,
    });

    const firstSocket = await connectAs(first);
    const secondSocket = await connectAs(second);
    await joinAuction(firstSocket, auction.id);
    await joinAuction(secondSocket, auction.id);

    // El primero se pone líder.
    firstSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: 10_000,
    });
    await firstSocket.waitFor('bid:accepted:self');

    // El segundo lo destrona (10.000 + incremento mínimo).
    secondSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: 10_500,
    });
    await secondSocket.waitFor('bid:accepted:self');

    // El superado recibe el aviso en su room personal `user:<id>`...
    const outbid = await firstSocket.waitFor<{
      auctionId: string;
      amountCents: number;
    }>('notification:outbid');
    expect(outbid).toEqual({ auctionId: auction.id, amountCents: 10_500 });

    // ...y quien NO ha sido superado no se entera de nada. Esta es la parte que los
    // tests unitarios no pueden comprobar: allí el gateway está mockeado, así que
    // se ve que se llamó a notifyOutbid(userId), pero no que el reparto por rooms
    // de Socket.IO deja fuera al resto. Si el aviso se emitiera por error a la room
    // de la subasta, se estaría filtrando a terceros quién va perdiendo.
    await secondSocket.expectNoEvent('notification:outbid');
  });

  it('el rate limit de pujas es por USUARIO: abrir otra pestaña no lo esquiva', async () => {
    const bidder = await createBuyer(ctx.prisma);
    const auction = await createLiveAuction(ctx.prisma, {
      startingPriceCents: 10_000,
      minIncrementCents: 500,
    });

    // Dos sockets DISTINTOS de la MISMA persona: es exactamente lo que pasa con
    // dos pestañas abiertas. Cuando el límite se llevaba por `client.id`, cada
    // pestaña tenía su propio cupo y bastaba con abrir varias para doblar el ritmo
    // de pujas permitido, que es justo lo que el límite existe para impedir.
    const pestana1 = await connectAs(bidder);
    const pestana2 = await connectAs(bidder);
    await joinAuction(pestana1, auction.id);
    await joinAuction(pestana2, auction.id);

    pestana1.raw.emit('bid', { auctionId: auction.id, maxAmountCents: 10_000 });
    await pestana1.waitFor('bid:accepted:self');

    // Inmediatamente después, la otra pestaña intenta pujar: mismo usuario, dentro
    // de la ventana, así que se frena.
    pestana2.raw.emit('bid', { auctionId: auction.id, maxAmountCents: 20_000 });
    const rechazo = await pestana2.waitFor<{ code: string }>('bid:rejected');
    expect(rechazo.code).toBe('RATE_LIMITED');

    // Y la puja frenada no llegó a la BD: el límite corta antes de la regla de
    // negocio, no después.
    expect(
      await ctx.prisma.bid.count({ where: { auctionId: auction.id } }),
    ).toBe(1);
  });
});
