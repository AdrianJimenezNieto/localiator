// `reflect-metadata` debe importarse ANTES que nada: PasswordService lleva el
// decorador @Injectable() de Nest, que al cargarse llama a Reflect.defineMetadata.
// Ese método no existe en Node por defecto — lo añade este polyfill. En la API
// normal lo carga main.ts; aquí, al arrancar fuera de Nest, hay que hacerlo a mano.
import 'reflect-metadata';

import { Prisma, PrismaClient, Role } from '@prisma/client';
import * as readline from 'node:readline';
import { Writable } from 'node:stream';
import { validatePassword } from '../auth/password.policy';
import { PasswordService } from '../auth/password.service';

/**
 * Crea una cuenta de ADMINISTRADOR (o asciende una existente).
 *
 * No hay ningún endpoint que haga esto, y es deliberado: una ruta "hazme admin"
 * sería justo el agujero que evita el RolesGuard, y el patrón "el primer usuario
 * registrado es admin" falla en cuanto alguien se adelanta al registro. El rol solo
 * se concede desde una máquina con acceso a la base de datos.
 *
 * Desarrollo (desde apps/api):
 *   pnpm admin:create -- --email admin@localiator.com
 *
 * Producción (dentro del contenedor, con el código ya compilado):
 *   docker compose exec api node dist/src/scripts/create-admin.js --email admin@localiator.com
 *
 * Opciones:
 *   --email <email>   obligatorio. Email de la cuenta.
 *   --promote         si el usuario YA existe, le cambia el rol a ADMIN.
 *   --set-password    si el usuario YA existe, le fija una contraseña nueva.
 *
 * La contraseña se pide por consola con el eco oculto; NUNCA se pasa como
 * argumento, porque quedaría en el historial del shell y sería visible para
 * cualquier usuario de la máquina con `ps`. Para uso no interactivo se puede pasar
 * en la variable de entorno ADMIN_PASSWORD.
 */

interface Options {
  email: string;
  promote: boolean;
  setPassword: boolean;
}

const USAGE = [
  'Uso: admin:create --email <email> [--promote] [--set-password]',
  '',
  '  --email <email>   Email de la cuenta de administrador (obligatorio).',
  '  --promote         Si el usuario ya existe, le cambia el rol a ADMIN.',
  '  --set-password    Si el usuario ya existe, le fija una contraseña nueva.',
  '',
  'La contraseña se pide por consola. Alternativa no interactiva: ADMIN_PASSWORD.',
].join('\n');

// Forma mínima de email: algo, una arroba, un dominio con punto y sin espacios.
// No pretende ser exhaustiva (validar emails con regex "de verdad" es imposible);
// solo atrapa erratas obvias antes de escribir en la base de datos.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseArgs(argv: string[]): Options {
  let email: string | undefined;
  let promote = false;
  let setPassword = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--') {
      // Separador convencional entre las opciones del gestor de paquetes y las del
      // script. pnpm no se lo come, nos lo pasa tal cual: lo ignoramos para que
      // `pnpm admin:create -- --email x` funcione igual que sin el `--`.
      continue;
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--email') {
      email = argv[++i];
    } else if (arg.startsWith('--email=')) {
      email = arg.slice('--email='.length);
    } else if (arg === '--promote') {
      promote = true;
    } else if (arg === '--set-password') {
      setPassword = true;
    } else {
      throw new Error(`Opción desconocida: ${arg}\n\n${USAGE}`);
    }
  }

  if (!email) {
    throw new Error(`Falta --email.\n\n${USAGE}`);
  }

  // Mismo saneado que hace el login (auth.service.ts): si aquí guardásemos
  // "Admin@..." y el login busca "admin@...", la cuenta nunca podría entrar.
  const normalized = email.toLowerCase().trim();
  if (!EMAIL_SHAPE.test(normalized)) {
    throw new Error(`Email no válido: ${email}`);
  }

  return { email: normalized, promote, setPassword };
}

// Lee una línea de la consola SIN mostrar lo que se teclea.
//
// El truco: readline pinta el eco de cada tecla en su stream de salida, así que le
// pasamos un "sumidero" que descarta todo lo que recibe. El texto del prompt lo
// escribimos nosotros directamente en stdout, que readline no toca.
function readHidden(prompt: string): Promise<string> {
  const sink = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: sink,
    terminal: true,
  });

  process.stdout.write(prompt);

  return new Promise((resolve) => {
    rl.question('', (answer) => {
      // El salto de línea del Enter también fue al sumidero: lo reponemos para que
      // la siguiente línea no se pegue al prompt.
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function obtainPassword(): Promise<string> {
  // Vía no interactiva (CI, aprovisionamiento automático). Se valida igual.
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) {
    const errors = validatePassword(fromEnv);
    if (errors.length > 0) {
      throw new Error(
        `La contraseña de ADMIN_PASSWORD no cumple la política:\n- ${errors.join('\n- ')}`,
      );
    }
    return fromEnv;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      'No hay terminal interactiva para pedir la contraseña. Define ADMIN_PASSWORD.',
    );
  }

  // Se repite hasta que la contraseña cumple la política Y coincide con su
  // confirmación. Sin límite de intentos a propósito: es una consola local, y
  // obligar a relanzar el comando por una errata solo molesta.
  for (;;) {
    const password = await readHidden('Contraseña del administrador: ');
    const errors = validatePassword(password);
    if (errors.length > 0) {
      console.error(
        `\nLa contraseña no cumple la política:\n- ${errors.join('\n- ')}\n`,
      );
      continue;
    }

    const repeated = await readHidden('Repite la contraseña: ');
    if (password !== repeated) {
      console.error('\nLas contraseñas no coinciden.\n');
      continue;
    }

    return password;
  }
}

// PasswordService es una clase sin dependencias en el constructor, así que se puede
// instanciar a pelo sin levantar el contenedor de Nest. Se reutiliza (en vez de
// llamar a argon2 aquí) para que el hash sea exactamente el mismo que espera el
// login: si algún día se cambia de algoritmo, este script lo hereda gratis.
async function hashPassword(): Promise<string> {
  const password = await obtainPassword();
  return new PasswordService().hash(password);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const existing = await prisma.user.findUnique({
      where: { email: options.email },
    });

    if (!existing) {
      const passwordHash = await hashPassword();
      const created = await prisma.user.create({
        data: {
          email: options.email,
          passwordHash,
          role: Role.ADMIN,
          // Sin esto la cuenta no podría iniciar sesión pasado el periodo de
          // gracia (auth.service.ts bloquea a los no verificados) y aquí no hay
          // ningún email de verificación que pulsar.
          emailVerifiedAt: new Date(),
        },
      });
      console.log(`Administrador creado: ${created.email} (id ${created.id}).`);
      return;
    }

    // Una cuenta anonimizada por derecho al olvido no se reutiliza: sus datos ya
    // fueron neutralizados y volver a darle vida rompería esa garantía.
    if (existing.anonymizedAt) {
      throw new Error(
        `La cuenta ${options.email} está anonimizada (RGPD) y no puede reutilizarse.`,
      );
    }

    const needsPromotion = existing.role !== Role.ADMIN;

    if (needsPromotion && !options.promote) {
      throw new Error(
        `Ya existe un usuario ${options.email} con rol ${existing.role}. ` +
          'Repite el comando con --promote para ascenderlo a ADMIN (no se toca su contraseña).',
      );
    }

    if (!needsPromotion && !options.setPassword) {
      console.log(
        `El usuario ${options.email} ya es ADMIN; no hay nada que hacer. ` +
          'Usa --set-password si quieres cambiarle la contraseña.',
      );
      return;
    }

    const data: Prisma.UserUpdateInput = {};

    if (needsPromotion) {
      data.role = Role.ADMIN;
      if (!existing.emailVerifiedAt) {
        data.emailVerifiedAt = new Date();
      }
    }

    if (options.setPassword) {
      data.passwordHash = await hashPassword();
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data,
    });

    console.log(
      `Usuario ${updated.email} actualizado: rol ${updated.role}` +
        (options.setPassword ? ', contraseña cambiada' : '') +
        '.',
    );

    // Cuenta creada con Google: no tiene contraseña local, así que el formulario
    // de /admin/login no le sirve aunque ya sea ADMIN.
    if (!updated.passwordHash) {
      console.warn(
        'Aviso: esta cuenta no tiene contraseña local (probablemente es de Google). ' +
          'Podrá entrar con Google, pero no por el formulario de /admin/login. ' +
          'Usa --set-password si quieres darle una.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
