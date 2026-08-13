import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Test de REGRESIÓN, no de comportamiento: vigila que nadie introduzca una vía de
// inyección SQL en el futuro.
//
// Prisma ofrece dos familias de consulta cruda:
//   - `$queryRaw`/`$executeRaw` como TAGGED TEMPLATE:
//         tx.$queryRaw`SELECT ... WHERE id = ${id}`
//     Pese a parecer interpolación de strings, Prisma NO concatena: convierte cada
//     `${}` en un parámetro ($1, $2…) que Postgres trata siempre como dato, nunca
//     como SQL. Es seguro y es lo que usa el proyecto (locks FOR UPDATE de pedidos
//     y subastas, contador de facturas).
//   - `$queryRawUnsafe`/`$executeRawUnsafe`, que reciben un string ya montado y SÍ
//     concatenan. Con cualquier dato de usuario dentro, es inyección directa.
//
// Hoy no hay ni un uso de la variante Unsafe. Este test lo deja fijado.
const API_SRC = resolve(__dirname, '..');

// `$queryRawUnsafe(`, `$executeRawUnsafe(`, y también la forma "raw" suelta de
// Prisma.raw/Prisma.sql sin parametrizar no se cubre aquí (Prisma.raw es legítimo
// para identificadores constantes); lo peligroso de verdad son las dos Unsafe.
const FORBIDDEN = /\$(query|execute)RawUnsafe/;

function* tsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* tsFiles(full);
    } else if (entry.endsWith('.ts')) {
      yield full;
    }
  }
}

describe('superficie de SQL cruda', () => {
  it('no usa $queryRawUnsafe ni $executeRawUnsafe en ningún sitio', () => {
    const offenders: string[] = [];
    for (const file of tsFiles(API_SRC)) {
      // El propio test menciona los nombres prohibidos; se excluye.
      if (file === __filename) continue;
      const content = readFileSync(file, 'utf8');
      if (FORBIDDEN.test(content)) {
        offenders.push(file.slice(API_SRC.length + 1));
      }
    }

    expect(offenders).toEqual([]);
  });
});
