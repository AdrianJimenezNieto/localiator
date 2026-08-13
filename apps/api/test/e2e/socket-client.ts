import { io, Socket } from 'socket.io-client';

// Cliente WebSocket para los e2e: un socket.io-client real contra el namespace
// `/auctions` de la app levantada por el harness.
//
// El problema que resuelve, y la razón de que esto no sea un `socket.on(...)`
// suelto en cada test: los eventos son ASÍNCRONOS y pueden llegar ANTES de que el
// test se ponga a escucharlos. Con un `on` a secas, un test que puja y luego
// espera `bid:accepted` se cuelga si el evento llegó en medio. Por eso todo lo que
// recibe el socket se va guardando en un buffer (`onAny`) y `waitFor` mira primero
// ahí; solo espera si el evento aún no ha llegado.
export interface TestSocket {
  // El socket crudo, por si un test necesita algo que no cubran los helpers.
  raw: Socket;
  // Espera al siguiente evento `event` no consumido y devuelve su payload. Cada
  // llamada consume uno, así que dos waitFor seguidos del mismo evento devuelven
  // el primero y el segundo, no dos veces el primero.
  waitFor: <T = unknown>(event: string, timeoutMs?: number) => Promise<T>;
  // Afirma que el evento NO llega en la ventana dada. Es el helper de los tests de
  // aislamiento (que un evento dirigido a un usuario no se cuele en la room de la
  // subasta). Ojo: al ser una espera real, encarece el test; úsese con ventanas
  // cortas y solo donde la ausencia sea la propiedad interesante.
  expectNoEvent: (event: string, windowMs?: number) => Promise<void>;
  close: () => void;
}

// Margen por defecto de las esperas. Generoso frente a un round-trip local (que va
// en milisegundos) pero por debajo del timeout de Jest, para que un evento que no
// llega falle con un mensaje claro ("no llegó X") en vez de con un timeout pelado.
const DEFAULT_TIMEOUT_MS = 2000;

export function connectAuctionSocket(
  port: number,
  options: { token?: string } = {},
): Promise<TestSocket> {
  const socket = io(`http://localhost:${port}/auctions`, {
    // `auth.token` es justo donde lo busca AuctionsGateway.handleConnection. Sin
    // token el socket se conecta igual, como invitado que solo mira.
    auth: options.token ? { token: options.token } : {},
    // Sin websocket forzado, socket.io-client empieza por polling HTTP y luego
    // hace upgrade; en un test eso solo añade latencia y ruido.
    transports: ['websocket'],
    // Un test no debe reconectar solo: si la conexión se cae, queremos ver el
    // fallo, no que se enmascare con un reintento.
    reconnection: false,
  });

  // Buffer de eventos recibidos y aún no consumidos, por nombre de evento.
  const pending = new Map<string, unknown[]>();
  // Esperas en curso (waitFor que aún no tienen su evento), por nombre.
  const waiters = new Map<string, ((payload: unknown) => void)[]>();

  socket.onAny((event: string, payload: unknown) => {
    // Si alguien ya está esperando este evento, se le entrega directamente; si no,
    // se guarda para el waitFor que venga después.
    const queue = waiters.get(event);
    const waiter = queue?.shift();
    if (waiter) {
      waiter(payload);
      return;
    }
    pending.set(event, [...(pending.get(event) ?? []), payload]);
  });

  const waitFor = <T = unknown>(
    event: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<T> => {
    const buffered = pending.get(event);
    if (buffered && buffered.length > 0) {
      return Promise.resolve(buffered.shift() as T);
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Se retira de la cola para no dejar un waiter zombi que se coma el evento
        // de un waitFor posterior.
        const queue = waiters.get(event) ?? [];
        waiters.set(
          event,
          queue.filter((w) => w !== onEvent),
        );
        reject(
          new Error(
            `El socket no recibió el evento '${event}' en ${timeoutMs} ms. ` +
              `Eventos recibidos y no consumidos: ${JSON.stringify([...pending.keys()])}`,
          ),
        );
      }, timeoutMs);

      const onEvent = (payload: unknown) => {
        clearTimeout(timer);
        resolve(payload as T);
      };

      waiters.set(event, [...(waiters.get(event) ?? []), onEvent]);
    });
  };

  const expectNoEvent = async (
    event: string,
    windowMs = 300,
  ): Promise<void> => {
    try {
      await waitFor(event, windowMs);
    } catch {
      return; // no llegó: es exactamente lo que se esperaba.
    }
    throw new Error(
      `Se recibió el evento '${event}', pero el test esperaba que NO llegara.`,
    );
  };

  return new Promise<TestSocket>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('El socket no llegó a conectarse.')),
      DEFAULT_TIMEOUT_MS,
    );
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve({
        raw: socket,
        waitFor,
        expectNoEvent,
        close: () => socket.disconnect(),
      });
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

// Entra a la room de una subasta y devuelve el estado inicial que el gateway manda
// solo al que entra (`auction:state`). Casi todos los tests empiezan por aquí.
export async function joinAuction<T = unknown>(
  socket: TestSocket,
  auctionId: string,
): Promise<T> {
  socket.raw.emit('join', { auctionId });
  return socket.waitFor<T>('auction:state');
}
