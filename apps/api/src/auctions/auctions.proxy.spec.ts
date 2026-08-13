import { ProxyRejection, ProxyState, resolveProxyBid } from './auctions.proxy';

// Tests de la regla de puja proxy. Al ser una función pura se puede recorrer todo
// el espacio de casos sin BD ni sockets, que es justo por lo que se extrajo.
describe('resolveProxyBid', () => {
  const rules = { startingPriceCents: 2000, minIncrementCents: 500 };
  const virgen: ProxyState = {
    currentPriceCents: null,
    leaderUserId: null,
    leaderMaxCents: null,
  };
  // Ana lidera a 2000 € con un techo secreto de 10 000.
  const anaLidera: ProxyState = {
    currentPriceCents: 2000,
    leaderUserId: 'ana',
    leaderMaxCents: 10_000,
  };

  describe('subasta sin pujas', () => {
    it('el primero se lleva el liderato al PRECIO DE SALIDA, no a su máximo', () => {
      const r = resolveProxyBid(virgen, rules, 'ana', 10_000);

      // Lo esencial del proxy: declarar 100 € no significa pagar 100 €.
      expect(r).toEqual({
        kind: 'lead',
        currentPriceCents: 2000,
        leaderUserId: 'ana',
        leaderMaxCents: 10_000,
        outbidUserId: null,
        defendedPriceCents: null,
      });
    });

    it('rechaza un máximo por debajo del precio de salida', () => {
      const r = resolveProxyBid(virgen, rules, 'ana', 1999);
      expect(r).toMatchObject({
        kind: 'rejected',
        reason: ProxyRejection.TOO_LOW,
        minValidCents: 2000,
      });
    });
  });

  describe('el retador no alcanza el techo del líder', () => {
    it('el proxy del líder sube solo lo necesario y el retador nace superado', () => {
      // Bruno puja 2500 contra el techo oculto de 10 000 de Ana.
      const r = resolveProxyBid(anaLidera, rules, 'bruno', 2500);

      expect(r).toEqual({
        kind: 'held',
        // 2500 + 500 de salto: lo justo para tapar a Bruno, MUY lejos del techo
        // de Ana. Nadie descubre que Ana llegaba a 10 000.
        currentPriceCents: 3000,
        leaderUserId: 'ana',
        leaderMaxCents: 10_000,
        // A quien se notifica es al retador, que ya está superado; a Ana no se le
        // molesta, porque su máximo sigue en pie.
        outbidUserId: 'bruno',
      });
    });

    it('el precio nunca pasa del techo del líder', () => {
      // Bruno puja 9800: 9800 + 500 se saldría del techo de Ana, así que el precio
      // se queda clavado en su máximo.
      const r = resolveProxyBid(anaLidera, rules, 'bruno', 9800);
      expect(r).toMatchObject({ kind: 'held', currentPriceCents: 10_000 });
    });

    it('EMPATE de máximos: gana quien lo puso primero (el líder actual)', () => {
      const r = resolveProxyBid(anaLidera, rules, 'bruno', 10_000);

      // Ana conserva el liderato y paga su máximo íntegro.
      expect(r).toMatchObject({
        kind: 'held',
        leaderUserId: 'ana',
        currentPriceCents: 10_000,
        outbidUserId: 'bruno',
      });
    });
  });

  describe('el retador supera el techo del líder', () => {
    it('se lleva el liderato pagando solo el salto por encima del techo rival', () => {
      const r = resolveProxyBid(anaLidera, rules, 'bruno', 50_000);

      expect(r).toMatchObject({
        kind: 'lead',
        // No paga sus 50 000: solo 10 000 + 500.
        currentPriceCents: 10_500,
        leaderUserId: 'bruno',
        leaderMaxCents: 50_000,
        // Ahora sí: Ana ha visto superado su máximo y hay que avisarla.
        outbidUserId: 'ana',
        // Su proxy se defendió hasta agotar el techo antes de caer.
        defendedPriceCents: 10_000,
      });
    });

    it('si su máximo queda por debajo del salto completo, paga su máximo', () => {
      // Bruno supera a Ana por 100 céntimos, menos que el salto de 500.
      const r = resolveProxyBid(anaLidera, rules, 'bruno', 10_100);
      expect(r).toMatchObject({
        kind: 'lead',
        currentPriceCents: 10_100,
        leaderUserId: 'bruno',
      });
    });

    it('rechaza al retador que no alcanza el precio actual + incremento', () => {
      const r = resolveProxyBid(anaLidera, rules, 'bruno', 2400);
      expect(r).toMatchObject({
        kind: 'rejected',
        reason: ProxyRejection.TOO_LOW,
        minValidCents: 2500,
      });
    });
  });

  describe('el líder sube su propio techo', () => {
    it('sube el máximo sin mover el precio ni avisar a nadie', () => {
      const r = resolveProxyBid(anaLidera, rules, 'ana', 20_000);

      // Nada público cambia: el resto de la sala no se entera de nada.
      expect(r).toEqual({ kind: 'raised-own-max', leaderMaxCents: 20_000 });
    });

    it('rechaza bajar (o repetir) el propio máximo: sería retractarse', () => {
      const r = resolveProxyBid(anaLidera, rules, 'ana', 10_000);
      expect(r).toMatchObject({
        kind: 'rejected',
        reason: ProxyRejection.MAX_NOT_INCREASED,
      });
    });
  });

  it('el precio siempre avanza al menos un incremento cuando cambia', () => {
    // Propiedad general que protege de un bucle de pujas que no suben nada.
    for (const max of [2500, 3000, 7000, 9999, 10_000, 10_001, 99_999]) {
      const r = resolveProxyBid(anaLidera, rules, 'bruno', max);
      if (r.kind === 'lead' || r.kind === 'held') {
        expect(r.currentPriceCents).toBeGreaterThanOrEqual(
          anaLidera.currentPriceCents! + rules.minIncrementCents,
        );
      }
    }
  });
});
