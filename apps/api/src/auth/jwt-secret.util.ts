import { ConfigService } from '@nestjs/config';

// Longitud mínima exigida en producción. 32 caracteres es el suelo razonable para
// un secreto HMAC (HS256 usa la clave tal cual): por debajo, un ataque de fuerza
// bruta offline sobre un JWT capturado deja de ser teórico.
const MIN_SECRET_LENGTH = 32;

// Secreto SOLO de desarrollo. Está en el repo a propósito (arrancar sin .env
// completo), y justo por eso no debe poder usarse nunca en producción: quien lea
// este fichero público podría firmarse un token de ADMIN.
const DEV_FALLBACK = 'dev-insecure-secret';

// Fuente ÚNICA del secreto de firma de los access tokens. Antes cada sitio que lo
// necesitaba (AuthModule, AuctionsModule, JwtStrategy) repetía
// `config.get('JWT_ACCESS_SECRET') || 'dev-insecure-secret'`, así que un despliegue
// con la variable sin definir arrancaba tan campante firmando con un secreto
// público: bypass total de autenticación, en silencio.
//
// Ahora en producción se falla al arrancar (fail fast) si falta o es débil. Un
// contenedor que no levanta es un incidente evidente; una API que valida tokens
// falsificados, no.
export function resolveAccessSecret(config: ConfigService): string {
  // `||` y no `??`: en .env el valor puede venir como cadena VACÍA, que debe
  // tratarse igual que ausente.
  const secret = config.get<string>('JWT_ACCESS_SECRET') || undefined;
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  if (!isProduction) {
    return secret ?? DEV_FALLBACK;
  }

  if (!secret) {
    throw new Error(
      'JWT_ACCESS_SECRET no está definido. Es obligatorio en producción: ' +
        'sin él la API firmaría los tokens con un secreto público del repositorio.',
    );
  }
  if (secret === DEV_FALLBACK) {
    throw new Error(
      'JWT_ACCESS_SECRET tiene el valor de desarrollo, que es público. ' +
        'Genera uno aleatorio (p. ej. `openssl rand -base64 48`).',
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_ACCESS_SECRET es demasiado corto (${secret.length} caracteres; ` +
        `mínimo ${MIN_SECRET_LENGTH}). Genera uno con \`openssl rand -base64 48\`.`,
    );
  }
  return secret;
}
