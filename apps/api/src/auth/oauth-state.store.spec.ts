import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { OAuthStateStore } from './oauth-state.store';

// Fábrica de un req/res falsos suficiente para el store: solo necesita
// `query`, `cookies`, y `res.cookie`/`res.clearCookie` (que el store usa vía
// `req.res`, igual que hace Express de verdad).
function makeReq(
  query: Record<string, string> = {},
  cookies: Record<string, string> = {},
) {
  const cookieJar: Record<string, string> = { ...cookies };
  const res = {
    cookie: jest.fn((name: string, value: string) => {
      cookieJar[name] = value;
    }),
    clearCookie: jest.fn((name: string) => {
      delete cookieJar[name];
    }),
  };
  const req = { query, cookies: cookieJar, res } as unknown as Request;
  return { req, res };
}

describe('OAuthStateStore', () => {
  let store: OAuthStateStore;

  beforeEach(() => {
    const config = { get: () => undefined } as unknown as ConfigService;
    store = new OAuthStateStore(config);
  });

  function store_(query: Record<string, string> = {}) {
    const { req, res } = makeReq(query);
    return new Promise<{ req: Request; res: typeof res; state: string }>(
      (resolve, reject) => {
        store.store(req, (err: Error | null, state?: string) => {
          if (err || !state) return reject(err ?? new Error('sin state'));
          resolve({ req, res, state });
        });
      },
    );
  }

  function verify_(req: Request, providedState: string) {
    return new Promise<{ ok: boolean; message?: string }>((resolve) => {
      store.verify(req, providedState, (err: Error | null, ok: boolean) => {
        resolve({ ok: ok && !err });
      });
    });
  }

  it('acepta un state válido y expone el next guardado en req.oauthNext', async () => {
    const { req, state } = await store_({ redirect: '/checkout' });
    const result = await verify_(req, state);
    expect(result.ok).toBe(true);
    expect(req.oauthNext).toBe('/checkout');
  });

  it('rechaza un state distinto al guardado', async () => {
    const { req } = await store_();
    const result = await verify_(req, 'un-state-inventado');
    expect(result.ok).toBe(false);
  });

  it('rechaza si no hay cookie de state (ausente/expirada)', async () => {
    const { req } = makeReq();
    const result = await verify_(req, 'cualquier-state');
    expect(result.ok).toBe(false);
  });

  it('borra la cookie de state tras verificar', async () => {
    const { req, res, state } = await store_();
    await verify_(req, state);
    expect(res.clearCookie).toHaveBeenCalledWith(
      'oauth_state',
      expect.objectContaining({ path: '/auth' }),
    );
  });

  it.each(['//evil.com', 'https://evil.com'])(
    'ignora un next malicioso (%s) y usa /oauth/callback',
    async (next) => {
      const { res } = await store_({ redirect: next });
      expect(res.cookie).toHaveBeenCalledWith(
        'oauth_state',
        expect.stringContaining('"next":"/oauth/callback"'),
        expect.anything(),
      );
    },
  );
});
