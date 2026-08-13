import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

// URL de la base de datos de los e2e. Se deriva de la de desarrollo (el `.env` de
// la raíz) añadiendo el sufijo `_test` al nombre de la BD, de forma que apunta al
// MISMO Postgres del docker-compose pero a otra base: los e2e borran tablas entre
// tests y jamás deben tocar los datos de desarrollo.
//
// Se puede forzar otra con DATABASE_URL_TEST (útil en CI, donde el Postgres del
// runner tiene otro host/credenciales).
export function testDatabaseUrl(): string {
  const forced = process.env.DATABASE_URL_TEST;
  if (forced) return forced;

  // El `.env` vive en la raíz del monorepo, igual que lo lee AppModule
  // (envFilePath: '../../.env'). `processEnv: {}` evita que dotenv escriba en el
  // process.env real: aquí solo queremos LEER la URL de desarrollo para derivar
  // la de test, no cargar el entorno entero.
  const parsed: Record<string, string> = {};
  loadDotenv({
    path: resolve(__dirname, '../../../../.env'),
    processEnv: parsed,
    quiet: true, // sin el banner de dotenv en la salida de los tests.
  });

  const devUrl = parsed.DATABASE_URL;
  if (!devUrl) {
    throw new Error(
      'No hay DATABASE_URL en el .env de la raíz ni DATABASE_URL_TEST en el entorno: ' +
        'los e2e no saben contra qué Postgres correr.',
    );
  }

  // URL(): el nombre de la BD es el pathname ('/localiator'). Se manipula con el
  // parser de URL en vez de con una regex para no romper contraseñas o parámetros
  // que contengan caracteres raros.
  const url = new URL(devUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}_test`;
  return url.toString();
}
