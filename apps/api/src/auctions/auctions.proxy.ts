// Puja proxy (puja automática por máximo).
//
// El usuario no puja un importe: declara el MÁXIMO que está dispuesto a pagar. El
// sistema puja en su nombre lo mínimo necesario para ir en cabeza y sube solo,
// salto mínimo a salto mínimo, cuando otro le disputa, sin pasar nunca de su techo.
//
// Toda la decisión vive en esta función PURA: no toca BD, no emite eventos, no mira
// el reloj. El motivo es que es la regla de negocio más delicada del proyecto (de
// ella salen el precio, el ganador y a quién se notifica) y así se puede razonar y
// testear sin montar una subasta entera. Quien la llama (AuctionsService.placeBid)
// se encarga de persistir el resultado y de emitir, siempre dentro del lock de la
// fila de la subasta.

// Estado del proxy tal como está guardado en la subasta antes de la puja.
export interface ProxyState {
  currentPriceCents: number | null; // null = aún no hay ninguna puja.
  leaderUserId: string | null;
  leaderMaxCents: number | null;
}

// Reglas fijas de la subasta que necesita el cálculo.
export interface ProxyRules {
  startingPriceCents: number;
  minIncrementCents: number;
}

// Motivos por los que una puja se rechaza ya en el cálculo (los traduce el
// servicio a su código estable de rechazo).
export const ProxyRejection = {
  TOO_LOW: 'TOO_LOW', // no llega al mínimo exigible.
  MAX_NOT_INCREASED: 'MAX_NOT_INCREASED', // ya lideras y no subes tu techo.
} as const;

export type ProxyRejectionCode =
  (typeof ProxyRejection)[keyof typeof ProxyRejection];

export type ProxyResolution =
  | { kind: 'rejected'; reason: ProxyRejectionCode; minValidCents: number }
  // El que puja toma (o mantiene) el liderato subiendo el precio.
  | {
      kind: 'lead';
      currentPriceCents: number;
      leaderUserId: string;
      leaderMaxCents: number;
      // A quién hay que avisar de que ha perdido el liderato (null si no había
      // líder previo, o si el anterior es el mismo que puja).
      outbidUserId: string | null;
      // Precio al que el proxy del líder anterior llegó defendiéndose antes de
      // caer. null si no hubo defensa que mostrar (no había líder, o su techo no
      // daba para subir el precio).
      defendedPriceCents: number | null;
    }
  // Ya eras el líder y solo has subido tu propio techo: nada cambia de cara al
  // resto (ni precio, ni líder, ni eventos públicos).
  | { kind: 'raised-own-max'; leaderMaxCents: number }
  // El líder aguanta: su proxy sube automáticamente y el retador nace superado.
  | {
      kind: 'held';
      currentPriceCents: number;
      leaderUserId: string;
      leaderMaxCents: number;
      // Siempre el que acaba de pujar: su máximo ya ha sido superado.
      outbidUserId: string;
    };

// Mínimo que debe alcanzar un máximo para ser aceptado: el precio de salida si la
// subasta está virgen, o el precio actual más el salto mínimo.
export function minValidBidCents(state: ProxyState, rules: ProxyRules): number {
  return state.currentPriceCents == null
    ? rules.startingPriceCents
    : state.currentPriceCents + rules.minIncrementCents;
}

export function resolveProxyBid(
  state: ProxyState,
  rules: ProxyRules,
  bidderUserId: string,
  maxCents: number,
): ProxyResolution {
  const { leaderUserId, leaderMaxCents } = state;
  const incr = rules.minIncrementCents;

  // Caso 1: subasta virgen. El primero se lleva el liderato al precio de salida,
  // por alto que sea su techo: no hay contra quién subir.
  if (leaderUserId == null || leaderMaxCents == null) {
    const minValid = minValidBidCents(state, rules);
    if (maxCents < minValid) {
      return {
        kind: 'rejected',
        reason: ProxyRejection.TOO_LOW,
        minValidCents: minValid,
      };
    }
    return {
      kind: 'lead',
      currentPriceCents: rules.startingPriceCents,
      leaderUserId: bidderUserId,
      leaderMaxCents: maxCents,
      outbidUserId: null,
      defendedPriceCents: null,
    };
  }

  // Caso 2: ya voy ganando y solo subo mi techo. No se exige superar el precio
  // actual (ya lo lidero); lo que hay que superar es MI PROPIO máximo anterior,
  // porque bajarlo sería retractarse de una puja ya comprometida.
  if (leaderUserId === bidderUserId) {
    if (maxCents <= leaderMaxCents) {
      return {
        kind: 'rejected',
        reason: ProxyRejection.MAX_NOT_INCREASED,
        minValidCents: leaderMaxCents + 1,
      };
    }
    return { kind: 'raised-own-max', leaderMaxCents: maxCents };
  }

  // A partir de aquí hay un duelo real: el retador debe al menos alcanzar el
  // mínimo exigible sobre el precio visible.
  const minValid = minValidBidCents(state, rules);
  if (maxCents < minValid) {
    return {
      kind: 'rejected',
      reason: ProxyRejection.TOO_LOW,
      minValidCents: minValid,
    };
  }

  // Caso 3: mi techo supera al del líder → me llevo el liderato, pero solo pago lo
  // justo para superarlo (o mi techo, si está por debajo de ese salto). Este es el
  // corazón del proxy: pujar 100 contra un líder de 20 deja el precio en 25, no en
  // 100.
  if (maxCents > leaderMaxCents) {
    return {
      kind: 'lead',
      currentPriceCents: Math.min(maxCents, leaderMaxCents + incr),
      leaderUserId: bidderUserId,
      leaderMaxCents: maxCents,
      outbidUserId: leaderUserId,
      // El proxy del líder anterior se defendió hasta agotar su techo antes de
      // caer. Solo es visible si con ello subió el precio.
      defendedPriceCents:
        state.currentPriceCents != null &&
        leaderMaxCents > state.currentPriceCents
          ? leaderMaxCents
          : null,
    };
  }

  // Caso 4: mi techo no supera al del líder (incluido el EMPATE, por el <=). El
  // líder aguanta y su proxy sube solo lo necesario para taparme; yo nazco
  // superado y me lo notifican al instante. El empate lo gana quien puso su máximo
  // primero, que es el líder actual: por eso el `<=` y no `<`.
  return {
    kind: 'held',
    currentPriceCents: Math.min(leaderMaxCents, maxCents + incr),
    leaderUserId,
    leaderMaxCents,
    outbidUserId: bidderUserId,
  };
}
