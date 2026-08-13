import {
  TestApp,
  createTestApp,
  resetDatabase,
  signAccessToken,
} from './harness';
import { connectAuctionSocket, joinAuction, TestSocket } from './socket-client';
import { createBuyer, createLiveAuction, TestUser } from './factories';
import { AuctionsService } from '../../src/auctions/auctions.service';

// Puja proxy de extremo a extremo: app real, Postgres real, sockets reales.
//
// Los tests unitarios de auctions.proxy.spec.ts ya cubren la aritmética de la
// regla. Lo que se comprueba AQUÍ es lo que aquellos no pueden ver: que el estado
// se persiste bien bajo el lock, que los eventos llegan a quien deben, y sobre
// todo que **los máximos no se filtran** por el canal en vivo.
describe('Puja proxy (e2e)', () => {
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

  async function connectAs(user: TestUser): Promise<TestSocket> {
    const socket = await connectAuctionSocket(ctx.port, {
      token: signAccessToken(ctx.app, user),
    });
    sockets.push(socket);
    return socket;
  }

  // Ventana del rate limit por usuario del gateway. Duplicada aquí a propósito (no
  // se importa la constante): si alguien la sube en el gateway, este test debe
  // fallar y obligar a mirarlo, en vez de seguir pasando esperando de menos.
  const MIN_BID_INTERVAL_MS = 1000;
  const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Escenario base del enunciado: precio de salida 20 €, salto de 5 €.
  async function escenario() {
    const ana = await createBuyer(ctx.prisma);
    const bruno = await createBuyer(ctx.prisma);
    const auction = await createLiveAuction(ctx.prisma, {
      startingPriceCents: 2000,
      minIncrementCents: 500,
    });
    return { ana, bruno, auction };
  }

  it('pujar 100 € con el precio en 20 € deja la puja en 20 €, no en 100 €', async () => {
    const { ana, auction } = await escenario();
    const anaSocket = await connectAs(ana);
    await joinAuction(anaSocket, auction.id);

    anaSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: 10_000,
    });
    await anaSocket.waitFor('bid:accepted:self');

    const precio = await anaSocket.waitFor<{ amountCents: number }>(
      'bid:accepted',
    );
    // El caso exacto que pediste: autorizar 100 € no significa pagar 100 €.
    expect(precio.amountCents).toBe(2000);

    const enBd = await ctx.prisma.auction.findUnique({
      where: { id: auction.id },
    });
    expect(enBd).toMatchObject({
      currentPriceCents: 2000,
      leaderUserId: ana.id,
      leaderMaxCents: 10_000,
    });
  });

  it('el proxy sube solo cuando alguien disputa, sin avisar al líder', async () => {
    const { ana, bruno, auction } = await escenario();
    const anaSocket = await connectAs(ana);
    const brunoSocket = await connectAs(bruno);
    await joinAuction(anaSocket, auction.id);
    await joinAuction(brunoSocket, auction.id);

    // Ana autoriza 100 €.
    anaSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: 10_000,
    });
    await anaSocket.waitFor('bid:accepted:self');
    // Se consume el `bid:accepted` de la puja de Ana en AMBOS sockets: están en la
    // misma room, así que los dos lo reciben, y si no se consume aquí el waitFor de
    // más abajo devolvería este evento viejo en vez del que interesa.
    await brunoSocket.waitFor('bid:accepted');
    await anaSocket.waitFor('bid:accepted');

    // Bruno puja 30 €: muy por debajo del techo de Ana.
    brunoSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: 3000,
    });
    await brunoSocket.waitFor('bid:accepted:self');

    // El precio sube solo a 35 € (30 + salto), defendiendo a Ana.
    const precio = await anaSocket.waitFor<{ amountCents: number }>(
      'bid:accepted',
    );
    expect(precio.amountCents).toBe(3500);

    // Bruno nace superado y se le avisa a él...
    const aviso = await brunoSocket.waitFor<{ amountCents: number }>(
      'notification:outbid',
    );
    expect(aviso.amountCents).toBe(3500);

    // ...y a Ana NO se la molesta: su máximo sigue en pie. Esto es exactamente lo
    // que pediste: no notificar hasta que superen SU cifra.
    await anaSocket.expectNoEvent('notification:outbid');

    // Ana sigue liderando en BD, y su techo no se ha tocado.
    const enBd = await ctx.prisma.auction.findUnique({
      where: { id: auction.id },
    });
    expect(enBd).toMatchObject({
      currentPriceCents: 3500,
      leaderUserId: ana.id,
      leaderMaxCents: 10_000,
    });
  });

  it('avisa al líder SOLO cuando superan su máximo', async () => {
    const { ana, bruno, auction } = await escenario();
    const anaSocket = await connectAs(ana);
    const brunoSocket = await connectAs(bruno);
    await joinAuction(anaSocket, auction.id);
    await joinAuction(brunoSocket, auction.id);

    anaSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: 10_000,
    });
    await anaSocket.waitFor('bid:accepted:self');

    // Bruno se pasa del techo de Ana.
    brunoSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: 50_000,
    });
    await brunoSocket.waitFor('bid:accepted:self');

    // Ahora sí le llega el aviso a Ana.
    const aviso = await anaSocket.waitFor<{ amountCents: number }>(
      'notification:outbid',
    );
    // Bruno no paga 500 €: solo 100 € + el salto.
    expect(aviso.amountCents).toBe(10_500);

    const enBd = await ctx.prisma.auction.findUnique({
      where: { id: auction.id },
    });
    expect(enBd).toMatchObject({
      currentPriceCents: 10_500,
      leaderUserId: bruno.id,
      leaderMaxCents: 50_000,
    });
  });

  it('un empate de máximos lo gana quien pujó primero', async () => {
    const { ana, bruno, auction } = await escenario();
    const anaSocket = await connectAs(ana);
    const brunoSocket = await connectAs(bruno);
    await joinAuction(anaSocket, auction.id);
    await joinAuction(brunoSocket, auction.id);

    anaSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: 10_000,
    });
    await anaSocket.waitFor('bid:accepted:self');

    brunoSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: 10_000,
    });
    await brunoSocket.waitFor('bid:accepted:self');

    const enBd = await ctx.prisma.auction.findUnique({
      where: { id: auction.id },
    });
    // Ana conserva el liderato y paga su máximo íntegro.
    expect(enBd).toMatchObject({
      leaderUserId: ana.id,
      currentPriceCents: 10_000,
    });
    await brunoSocket.waitFor('notification:outbid');
  });

  // El test de privacidad más importante del módulo. Si un máximo se filtrara,
  // cualquiera podría ganar cualquier subasta por un céntimo.
  it('NUNCA emite el máximo de nadie por el canal de la sala', async () => {
    const { ana, bruno, auction } = await escenario();
    const anaSocket = await connectAs(ana);
    const brunoSocket = await connectAs(bruno);
    await joinAuction(anaSocket, auction.id);

    const MAXIMO_SECRETO = 987_654;
    anaSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: MAXIMO_SECRETO,
    });
    await anaSocket.waitFor('bid:accepted:self');

    // Bruno entra DESPUÉS de la puja de Ana: recibe el estado inicial completo y
    // luego provoca una subida automática. Se inspecciona todo lo que ve.
    const estadoInicial = await joinAuction(brunoSocket, auction.id);
    brunoSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: 3000,
    });
    await brunoSocket.waitFor('bid:accepted:self');
    const broadcast = await brunoSocket.waitFor('bid:accepted');
    const avisoPropio = await brunoSocket.waitFor('notification:outbid');

    const todoLoQueVeBruno = JSON.stringify([
      estadoInicial,
      broadcast,
      avisoPropio,
    ]);
    expect(todoLoQueVeBruno).not.toContain(String(MAXIMO_SECRETO));
    // Tampoco debe colarse el nombre del campo por un `select` demasiado ancho.
    expect(todoLoQueVeBruno).not.toContain('leaderMaxCents');

    // Y el estado inicial no revela el máximo de Ana ni por asomo: `myMaxCents`
    // es el de BRUNO (aún null cuando entró) y jamás el del líder.
    expect(estadoInicial).toMatchObject({ myMaxCents: null, isLeading: false });
  });

  it('el historial nunca revela el máximo del líder EN PIE, aunque sí lo pujado por los ya batidos', async () => {
    const { ana, bruno, auction } = await escenario();
    const anaSocket = await connectAs(ana);
    const brunoSocket = await connectAs(bruno);
    await joinAuction(anaSocket, auction.id);
    await joinAuction(brunoSocket, auction.id);

    const MAXIMO_DE_ANA = 500_000; // secreto: Ana sigue liderando al final.
    const MAXIMO_DE_BRUNO = 30_000; // Bruno queda batido: su puja es pública.

    anaSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: MAXIMO_DE_ANA,
    });
    await anaSocket.waitFor('bid:accepted:self');
    brunoSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: MAXIMO_DE_BRUNO,
    });
    await brunoSocket.waitFor('notification:outbid');

    // Un tercero entra ahora y ve el historial completo de la subasta.
    const mirona = await createBuyer(ctx.prisma);
    const mironaSocket = await connectAs(mirona);
    const estado = await joinAuction(mironaSocket, auction.id);
    const historial = JSON.stringify(estado);

    // INVARIANTE que sí sostiene el sistema: el techo de quien va ganando no está
    // en ninguna parte. Quien lo conociera ganaría la subasta por un céntimo.
    expect(historial).not.toContain(String(MAXIMO_DE_ANA));

    // Y lo que SÍ es público por diseño: lo que llegó a comprometer un pujador ya
    // batido. Es el registro veraz de la subasta y es lo único que explica por qué
    // el proxy de Ana subió solo. Mismo criterio que eBay. Si algún día se decide
    // ocultarlo, este test es el que hay que cambiar a conciencia, no por accidente.
    expect(historial).toContain(String(MAXIMO_DE_BRUNO));
  });

  it('devuelve a cada usuario su propio máximo, y solo el suyo', async () => {
    const { ana, bruno, auction } = await escenario();
    const anaSocket = await connectAs(ana);
    await joinAuction(anaSocket, auction.id);

    anaSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: 10_000,
    });
    await anaSocket.waitFor('bid:accepted:self');

    // Ana, al reconectar, recupera SU máximo y sabe que va ganando.
    const otraPestanaDeAna = await connectAs(ana);
    const estadoDeAna = await joinAuction(otraPestanaDeAna, auction.id);
    expect(estadoDeAna).toMatchObject({ myMaxCents: 10_000, isLeading: true });

    // Bruno, en la misma subasta, no ve ningún máximo.
    const brunoSocket = await connectAs(bruno);
    const estadoDeBruno = await joinAuction(brunoSocket, auction.id);
    expect(estadoDeBruno).toMatchObject({ myMaxCents: null, isLeading: false });
  });

  it('el líder puede subir su techo sin que la sala perciba nada', async () => {
    const { ana, bruno, auction } = await escenario();
    const anaSocket = await connectAs(ana);
    const brunoSocket = await connectAs(bruno);
    await joinAuction(anaSocket, auction.id);
    await joinAuction(brunoSocket, auction.id);

    anaSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: 10_000,
    });
    await anaSocket.waitFor('bid:accepted:self');
    await brunoSocket.waitFor('bid:accepted'); // la puja inicial sí se ve.

    // Ana refuerza su máximo. El gateway limita a una puja por segundo y POR
    // USUARIO, así que hay que dejar pasar la ventana: cambiar de pestaña ya NO
    // sirve para saltársela (ver el test de rate limit en auctions.gateway.e2e).
    await esperar(MIN_BID_INTERVAL_MS + 100);
    anaSocket.raw.emit('bid', {
      auctionId: auction.id,
      maxAmountCents: 80_000,
    });
    await anaSocket.waitFor('bid:accepted:self');

    // Bruno no percibe absolutamente nada: ni precio nuevo, ni movimiento.
    await brunoSocket.expectNoEvent('bid:accepted');

    const enBd = await ctx.prisma.auction.findUnique({
      where: { id: auction.id },
    });
    expect(enBd).toMatchObject({
      currentPriceCents: 2000, // el precio NO se ha movido.
      leaderMaxCents: 80_000,
    });
  });

  // Concurrencia real contra Postgres: es lo único que valida de verdad que el
  // SELECT ... FOR UPDATE serializa las pujas. Con Prisma mockeado no se prueba.
  it('con pujas simultáneas queda un único líder coherente', async () => {
    const auction = await createLiveAuction(ctx.prisma, {
      startingPriceCents: 2000,
      minIncrementCents: 500,
    });
    const pujadores = await Promise.all(
      Array.from({ length: 8 }, () => createBuyer(ctx.prisma)),
    );

    // Ocho máximos distintos y crecientes, lanzados a la vez por HTTP (el servicio
    // es el mismo que usa el WebSocket). Se toleran los rechazos: lo que importa
    // es que el estado final sea consistente, no cuántas entran.
    const service = ctx.app.get(AuctionsService);

    await Promise.allSettled(
      pujadores.map((u, i) =>
        service.placeBid(auction.id, u.id, {
          maxAmountCents: 5000 + i * 1000,
        }),
      ),
    );

    const enBd = await ctx.prisma.auction.findUnique({
      where: { id: auction.id },
    });
    // El líder final debe ser quien más autorizó de los que llegaron a entrar, y
    // el precio no puede superar nunca su techo.
    expect(enBd!.leaderUserId).not.toBeNull();
    expect(enBd!.currentPriceCents).toBeLessThanOrEqual(enBd!.leaderMaxCents!);
    // Y ese líder es coherente con lo que hay registrado: nadie con un techo mayor
    // se quedó fuera silenciosamente.
    const mayorMaximo = await ctx.prisma.bid.findFirst({
      where: { auctionId: auction.id, isAutomatic: false },
      orderBy: { maxAmountCents: 'desc' },
    });
    expect(enBd!.leaderUserId).toBe(mayorMaximo!.userId);
  });
});
