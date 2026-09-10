import { PrismaClient } from '@prisma/client';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Importa en el catálogo un CSV de artículos comprados en subasta (John Pye).
 *
 * IDEMPOTENTE: cada ficha se identifica con un `id` DETERMINISTA derivado del CSV
 * (no un cuid aleatorio), así que el proceso se puede relanzar tantas veces como
 * haga falta y ACTUALIZA en vez de duplicar. Es el mismo truco que usa el seed:
 * Prisma deja fijar el `id` en el `create` de un `upsert`.
 *
 * Desarrollo (desde apps/api):
 *   pnpm catalog:import -- --csv ../../datos/listado.csv --photos ../../datos/fotos-web
 *
 * Producción (dentro del contenedor, con el código ya compilado):
 *   docker compose exec api node dist/src/scripts/import-catalog.js \
 *     --csv /tmp/import/listado.csv --photos /tmp/import/fotos-web
 *
 * Opciones:
 *   --csv <ruta>    obligatoria. CSV separado por ';', UTF-8 (con o sin BOM).
 *   --photos <dir>  obligatoria. Carpeta con las fotos ya redimensionadas,
 *                   nombradas `<carpeta del producto>.jpg`.
 *   --dry-run       no escribe nada: calcula e imprime lo que haría.
 *   --out <ruta>    CSV con el resultado (por defecto `resultado-subida.csv`).
 */

// --- Reglas de negocio de la importación -----------------------------------

// Un lote de N unidades se publica DOS veces: entero, y como artículo suelto.
// Solo desdoblamos si la unidad vale lo suficiente para justificar el viaje al
// almacén; por debajo (pilas, dentífrico, detergente) se vende solo el lote.
const PRECIO_UNITARIO_MINIMO_CENTS = 1000; // 10 €

// El suelto se encarece frente al lote para que comprar el lote siga compensando
// (con 1,4 el lote sale ~29 % más barato por unidad).
const MARGEN_UNITARIO = 1.4;

// Lotes HETEROGÉNEOS: "2 X Artículos Electrónicos que Incluye KRUPS..." no son dos
// unidades del mismo artículo, sino un revoltijo de cosas distintas. Desdoblarlos
// publicaría "2 unidades" de algo que no existe como tal, así que se venden solo
// como lote entero.
const PATRON_LOTE_MIXTO = /que incluye|varias marcas|varios modelos/i;

interface Fila {
  nombre: string;
  descripcion: string;
  precioEur: number;
  pvpEur: number | null;
  unidades: number;
  carpeta: string;
}

interface Ficha {
  id: string;
  tipo: 'product' | 'lot';
  name: string;
  description: string;
  priceCents: number;
  stock: number;
  foto: string; // nombre del archivo dentro de la carpeta de fotos.
}

interface Args {
  csv: string;
  photos: string;
  dryRun: boolean;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const csv = get('--csv');
  const photos = get('--photos');
  if (!csv || !photos) {
    console.error(
      'Uso: import-catalog --csv <ruta.csv> --photos <dir> [--dry-run] [--out <ruta.csv>]',
    );
    process.exit(1);
  }
  return {
    csv: resolve(csv),
    photos: resolve(photos),
    dryRun: argv.includes('--dry-run'),
    out: resolve(get('--out') ?? 'resultado-subida.csv'),
  };
}

// El CSV no lleva comillas ni ';' incrustados (verificado sobre el fichero real),
// así que un split basta y nos ahorra arrastrar una dependencia de parseo.
function parseCsv(texto: string): Fila[] {
  const lineas = texto
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/);
  const cabecera = lineas[0].split(';');
  const idx = (col: string): number => {
    const i = cabecera.indexOf(col);
    if (i === -1) throw new Error(`Falta la columna "${col}" en el CSV`);
    return i;
  };
  const col = {
    nombre: idx('nombre'),
    descripcion: idx('descripcion_web'),
    precio: idx('precio_web_eur'),
    pvp: idx('pvp_referencia_eur'),
    unidades: idx('unidades'),
    carpeta: idx('carpeta'),
  };

  // El CSV trae los decimales con coma (formato español).
  const num = (v: string): number => Number(v.trim().replace(',', '.'));

  return lineas.slice(1).map((linea, n) => {
    const campos = linea.split(';');
    const precioEur = num(campos[col.precio]);
    if (!Number.isFinite(precioEur) || precioEur <= 0) {
      throw new Error(
        `Fila ${n + 2}: precio no válido "${campos[col.precio]}"`,
      );
    }
    const pvpBruto = campos[col.pvp]?.trim();
    return {
      nombre: campos[col.nombre].trim(),
      descripcion: campos[col.descripcion].trim(),
      precioEur,
      pvpEur: pvpBruto ? num(pvpBruto) : null,
      unidades: Math.max(1, Math.trunc(num(campos[col.unidades])) || 1),
      carpeta: campos[col.carpeta].trim(),
    };
  });
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "3 X Cámara Inteligente" -> "Cámara Inteligente". El nombre del lote lleva el
// recuento delante; la ficha del artículo suelto no debe heredarlo.
function nombreUnitario(nombre: string): string {
  return nombre.replace(/^\s*(?:x\s*)?\d+\s*x?\s*/i, '').trim() || nombre;
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function describir(base: string, extras: (string | null)[]): string {
  return [base, ...extras.filter((x): x is string => Boolean(x))].join('\n\n');
}

// Convierte las filas del CSV en las fichas que hay que publicar.
export function construirFichas(filas: Fila[]): Ficha[] {
  const fichas: Ficha[] = [];
  // Los sueltos de un mismo artículo se agrupan en UNA ficha con stock N: son
  // unidades idénticas del mismo producto, que es justo para lo que existe
  // `stock`. Sin esto saldrían decenas de fichas clonadas en el catálogo.
  const sueltos = new Map<string, Ficha>();

  for (const fila of filas) {
    const carpeta = fila.carpeta.split('/').pop() ?? fila.carpeta;
    const foto = `${carpeta}.jpg`;
    const id = `jp-${slug(carpeta)}`;
    const precioCents = Math.round(fila.precioEur * 100);
    const pvpCents =
      fila.pvpEur === null ? null : Math.round(fila.pvpEur * 100);

    if (fila.unidades <= 1) {
      // Artículo único: una ficha, stock 1.
      fichas.push({
        id,
        tipo: 'product',
        name: fila.nombre,
        description: describir(fila.descripcion, [
          pvpCents === null
            ? null
            : `PVP recomendado del fabricante: ${eur(pvpCents)} €.`,
        ]),
        priceCents: precioCents,
        stock: 1,
        foto,
      });
      continue;
    }

    // Lote: se publica entero con stock 1 (es un lote físico concreto).
    fichas.push({
      id,
      tipo: 'lot',
      name: fila.nombre,
      description: describir(fila.descripcion, [
        `Lote de ${fila.unidades} unidades.`,
        pvpCents === null
          ? null
          : `PVP recomendado del fabricante del lote completo: ${eur(pvpCents)} €.`,
      ]),
      priceCents: precioCents,
      stock: 1,
      foto,
    });

    // Y además, si la unidad vale lo suficiente y el lote es homogéneo, como
    // artículo suelto.
    if (PATRON_LOTE_MIXTO.test(fila.nombre)) continue;
    const unitarioCents = Math.round(
      (precioCents / fila.unidades) * MARGEN_UNITARIO,
    );
    if (unitarioCents < PRECIO_UNITARIO_MINIMO_CENTS) continue;

    const nombre = nombreUnitario(fila.nombre);
    const clave = slug(nombre);
    const yaVisto = sueltos.get(clave);
    if (yaVisto) {
      // El mismo artículo aparece en otro lote: suma stock y deja el precio más
      // bajo de los dos (no penalizar al comprador por un lote menos ventajoso).
      yaVisto.stock += fila.unidades;
      yaVisto.priceCents = Math.min(yaVisto.priceCents, unitarioCents);
      continue;
    }

    const suelto: Ficha = {
      id: `jp-u-${clave}`.slice(0, 120),
      tipo: 'product',
      name: nombre,
      description: describir(fila.descripcion, [
        'Se vende por unidades sueltas; también disponible como lote completo.',
        // El PVP del CSV es el del lote entero, así que el unitario se reparte.
        pvpCents === null
          ? null
          : `PVP recomendado del fabricante: ${eur(Math.round(pvpCents / fila.unidades))} €.`,
      ]),
      priceCents: unitarioCents,
      stock: fila.unidades,
      foto,
    };
    sueltos.set(clave, suelto);
    fichas.push(suelto);
  }

  return fichas;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  const filas = parseCsv(await readFile(args.csv, 'utf8'));
  const fichas = construirFichas(filas);

  const uploadDir = resolve(process.env.UPLOAD_DIR ?? 'uploads');
  const baseUrl = (
    process.env.API_PUBLIC_URL ?? 'http://localhost:3000'
  ).replace(/\/$/, '');

  const productos = fichas.filter((f) => f.tipo === 'product').length;
  console.log(`Filas leídas:      ${filas.length}`);
  console.log(`Fichas a publicar: ${fichas.length}`);
  console.log(`  productos:       ${productos}`);
  console.log(`  lotes:           ${fichas.length - productos}`);
  console.log(`Fotos ->           ${uploadDir}`);
  if (args.dryRun) console.log('\n*** DRY RUN: no se escribe nada ***\n');

  const informe = ['id;tipo;nombre;precio_eur;stock;estado;ruta;error'];
  let creados = 0;
  let actualizados = 0;
  let errores = 0;

  if (!args.dryRun) await mkdir(uploadDir, { recursive: true });

  for (const ficha of fichas) {
    let estado = 'creado';
    let error = '';
    let ruta = '';
    try {
      // La foto se copia con un nombre estable derivado del id de la ficha:
      // relanzar el import sobrescribe el mismo archivo en vez de acumular
      // huérfanas en el volumen.
      const destino = `${ficha.id}.jpg`;
      const fotoUrl = `${baseUrl}/uploads/${destino}`;

      const datos = {
        name: ficha.name,
        description: ficha.description,
        priceCents: ficha.priceCents,
        discountCents: 0,
        stock: ficha.stock,
        photos: [fotoUrl],
      };

      if (!args.dryRun) {
        await copyFile(join(args.photos, ficha.foto), join(uploadDir, destino));

        // Product y Lot son tablas separadas y Prisma no unifica sus delegates,
        // así que se ramifica; el `data` es idéntico en ambas ramas.
        if (ficha.tipo === 'lot') {
          const previo = await prisma.lot.findUnique({
            where: { id: ficha.id },
            select: { id: true },
          });
          estado = previo ? 'actualizado' : 'creado';
          await prisma.lot.upsert({
            where: { id: ficha.id },
            update: datos,
            create: { id: ficha.id, ...datos },
          });
        } else {
          const previo = await prisma.product.findUnique({
            where: { id: ficha.id },
            select: { id: true },
          });
          estado = previo ? 'actualizado' : 'creado';
          await prisma.product.upsert({
            where: { id: ficha.id },
            update: datos,
            create: { id: ficha.id, ...datos },
          });
        }
      }

      ruta = `/${ficha.tipo === 'lot' ? 'lotes' : 'productos'}/${ficha.id}/${slug(ficha.name)}`;
      if (estado === 'actualizado') actualizados++;
      else creados++;
    } catch (err) {
      estado = 'error';
      error = err instanceof Error ? err.message : String(err);
      errores++;
    }

    informe.push(
      [
        ficha.id,
        ficha.tipo,
        ficha.name,
        (ficha.priceCents / 100).toFixed(2),
        String(ficha.stock),
        estado,
        ruta,
        error,
      ]
        // El informe también va separado por ';': si un campo lo trae, se cambia
        // por una coma para no romper las columnas.
        .map((campo) => campo.replace(/;/g, ','))
        .join(';'),
    );
  }

  await writeFile(args.out, informe.join('\n'), 'utf8');

  console.log(`\ncreados:      ${creados}`);
  console.log(`actualizados: ${actualizados}`);
  console.log(`errores:      ${errores}`);
  console.log(`informe:      ${args.out}`);

  await prisma.$disconnect();
  if (errores > 0) process.exitCode = 1;
}

// Solo se ejecuta al lanzarlo como script. Sin esta guarda, importarlo desde el
// test dispararía main() (y su process.exit por falta de argumentos).
if (require.main === module) {
  void main();
}
