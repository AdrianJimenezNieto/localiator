import { ConfigService } from '@nestjs/config';
import { resolveAccessSecret } from './jwt-secret.util';

// ConfigService de mentira: solo devuelve el mapa que le pasemos.
function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

const STRONG = 'x'.repeat(48);

describe('resolveAccessSecret', () => {
  describe('en desarrollo', () => {
    it('usa el fallback si no hay secreto (para poder arrancar sin .env completo)', () => {
      expect(resolveAccessSecret(configWith({}))).toBe('dev-insecure-secret');
    });

    it('trata el secreto vacío como ausente', () => {
      expect(resolveAccessSecret(configWith({ JWT_ACCESS_SECRET: '' }))).toBe(
        'dev-insecure-secret',
      );
    });
  });

  describe('en producción', () => {
    const prod = (secret?: string) =>
      configWith({ NODE_ENV: 'production', JWT_ACCESS_SECRET: secret });

    // El bug que esto previene: sin la variable, la API arrancaba firmando los
    // access tokens con un literal público del repositorio. Cualquiera podía
    // fabricarse un token de ADMIN. Mejor no arrancar.
    it('falla si falta el secreto', () => {
      expect(() => resolveAccessSecret(prod())).toThrow(/no está definido/);
    });

    it('falla si el secreto es el de desarrollo', () => {
      expect(() => resolveAccessSecret(prod('dev-insecure-secret'))).toThrow(
        /público/,
      );
    });

    it('falla si el secreto es demasiado corto para HS256', () => {
      expect(() => resolveAccessSecret(prod('corto'))).toThrow(/corto/);
    });

    it('acepta un secreto largo', () => {
      expect(resolveAccessSecret(prod(STRONG))).toBe(STRONG);
    });
  });
});
