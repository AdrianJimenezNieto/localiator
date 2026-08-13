import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { testDatabaseUrl } from './database';

// `globalSetup` de Jest: corre UNA vez antes de toda la tanda de e2e. Deja el
// esquema de la BD de test al día aplicando las migraciones.
//
// `prisma migrate deploy` (no `migrate dev`) porque no queremos que genere
// migraciones ni pida confirmación: solo aplica las que ya están en el repo, que
// es lo que hará también producción. Si la base `_test` no existe, Prisma la crea
// sola, así que no hace falta ni psql ni docker exec.
export default function globalSetup(): void {
  const databaseUrl = testDatabaseUrl();
  const apiRoot = resolve(__dirname, '../..');

  try {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      // 'pipe': el output de Prisma solo se muestra si algo falla, para no
      // ensuciar la salida de los tests en el caso normal.
      stdio: 'pipe',
    });
  } catch (error) {
    // El error de execFileSync no incluye el output en su mensaje, y sin él el
    // fallo típico ("no hay Postgres escuchando") es indescifrable.
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      'No se pudieron aplicar las migraciones sobre la BD de test ' +
        `(${databaseUrl}). ¿Está levantado el Postgres del docker-compose?\n\n` +
        `${stdout?.toString() ?? ''}\n${stderr?.toString() ?? ''}`,
    );
  }
}
