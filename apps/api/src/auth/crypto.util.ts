import { createHash, randomBytes } from 'node:crypto';

// Tokens de un solo uso (verificación de email, reseteo de contraseña, refresh
// tokens opacos). NO son contraseñas: son valores aleatorios de alta entropía,
// así que basta con un hash rápido (SHA-256) en vez de argon2. Argon2 es caro a
// propósito para frenar fuerza bruta sobre secretos de baja entropía elegidos por
// humanos; un token de 32 bytes aleatorios no se puede adivinar por fuerza bruta,
// de modo que el coste de argon2 no aportaría nada aquí.

// 32 bytes = 256 bits de entropía. En base64url queda una cadena apta para URLs.
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

// Se guarda en BD SOLO este hash. Al validar, se hashea el token entrante y se
// compara con lo almacenado: si se filtra la BD, los hashes no son reutilizables.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
