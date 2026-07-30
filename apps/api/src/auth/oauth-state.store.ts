import * as crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type OAuth2Strategy from 'passport-oauth2';

type Metadata = OAuth2Strategy.Metadata;
type StoreCallback = OAuth2Strategy.StateStoreStoreCallback;
type VerifyCallback = OAuth2Strategy.StateStoreVerifyCallback;

const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

declare module 'express' {
  interface Request {
    // Destino post-login extraído del state verificado (ver `verify` abajo).
    // Solo lo pone OAuthStateStore; el controller lo lee de vuelta.
    oauthNext?: string;
  }
}

interface StatePayload {
  state: string;
  next: string;
}

// Store de `state` para passport-oauth2 que sustituye a express-session: en vez
// de guardar el valor aleatorio en una sesión de servidor, lo metemos en una
// cookie HttpOnly de corta duración junto al destino post-login (`next`). Así
// evitamos el login CSRF de OAuth sin añadir un store de sesión al proyecto,
// que es deliberadamente stateless (JWT + refresh en cookie).
@Injectable()
export class OAuthStateStore implements OAuth2Strategy.StateStore {
  constructor(private readonly config: ConfigService) {}

  // La interfaz StateStore de passport-oauth2 declara `store` con dos formas
  // ((req, cb) y (req, meta, cb)): implementamos una sola función que acepta
  // ambas, aunque solo usamos la de 3 argumentos (passport-oauth2@1.8.0 nos
  // llama así). `meta` lo genera passport y no lo necesitamos; lo que sí leemos
  // es `req.query.redirect`, el destino que pidió el frontend (p. ej. `/checkout`).
  store(req: Request, callback: StoreCallback): void;
  store(req: Request, meta: Metadata, callback: StoreCallback): void;
  store(
    req: Request,
    metaOrCallback: Metadata | StoreCallback,
    maybeCallback?: StoreCallback,
  ): void {
    const callback =
      typeof metaOrCallback === 'function' ? metaOrCallback : maybeCallback!;

    const state = crypto.randomBytes(32).toString('base64url');
    const next = this.sanitizeNext(req.query.redirect);
    const payload: StatePayload = { state, next };

    req.res!.cookie(OAUTH_STATE_COOKIE, JSON.stringify(payload), {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV') === 'production',
      maxAge: OAUTH_STATE_TTL_MS,
      path: '/auth',
    });

    callback(null, state);
  }

  // Mismo patrón para `verify`: comparamos en tiempo constante para no filtrar
  // por temporización si el state coincide byte a byte con uno adivinado.
  verify(req: Request, state: string, callback: VerifyCallback): void;
  verify(
    req: Request,
    state: string,
    meta: Metadata,
    callback: VerifyCallback,
  ): void;
  verify(
    req: Request,
    providedState: string,
    metaOrCallback: Metadata | VerifyCallback,
    maybeCallback?: VerifyCallback,
  ): void {
    const callback =
      typeof metaOrCallback === 'function' ? metaOrCallback : maybeCallback!;

    const raw = (req.cookies as Record<string, string> | undefined)?.[
      OAUTH_STATE_COOKIE
    ];
    req.res!.clearCookie(OAUTH_STATE_COOKIE, { path: '/auth' });

    if (!raw) {
      return callback(null, false, { message: 'Falta la cookie de state' });
    }

    let payload: StatePayload;
    try {
      payload = JSON.parse(raw) as StatePayload;
    } catch {
      return callback(null, false, { message: 'Cookie de state inválida' });
    }

    if (!this.timingSafeEqual(payload.state, providedState)) {
      return callback(null, false, { message: 'State no coincide' });
    }

    // req.oauthNext lo lee el controller para saber a dónde redirigir tras el
    // login (decisión: el destino viaja dentro del state, nunca como query
    // manipulable en el callback).
    req.oauthNext = payload.next;
    callback(null, true, undefined);
  }

  private timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  // Solo aceptamos rutas relativas que empiecen por `/` y no por `//` (que el
  // navegador interpretaría como protocol-relative URL a otro host) — evita un
  // open redirect a través del parámetro `redirect`. Sin destino explícito (o
  // si es inválido/malicioso), caemos en /oauth/callback: es quien enseña
  // "Iniciando sesión…" mientras el AuthProvider rehidrata la sesión.
  private sanitizeNext(value: unknown): string {
    if (
      typeof value === 'string' &&
      value.startsWith('/') &&
      !value.startsWith('//')
    ) {
      return value;
    }
    return '/oauth/callback';
  }
}
