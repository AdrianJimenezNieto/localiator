import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AddressInfo } from 'node:net';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AccessTokenPayload } from '../../src/auth/session.service';

// Andamiaje compartido de los tests e2e: levanta la aplicación NestJS REAL contra
// el Postgres de test y da utilidades para hablar con ella por WebSocket.
//
// La diferencia con los .spec.ts unitarios es el punto ciego que vienen a cubrir:
// allí Prisma y el gateway están mockeados, así que se comprueba que el servicio
// LLAMA a broadcastX(...). Aquí no hay mocks: hay un socket.io de verdad, rooms de
// verdad y transacciones de verdad, así que se comprueba que el evento LLEGA a
// quien tiene que llegar (y, sobre todo, que no llega a quien no debe).

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  // Puerto efímero en el que escucha esta instancia. No se usa uno fijo para poder
  // correr los e2e con la API de desarrollo levantada en el 3000 sin chocar.
  port: number;
  close: () => Promise<void>;
}

// Levanta la app completa. Replica de main.ts lo que afecta al comportamiento
// observable (ValidationPipe, cookieParser); se omiten helmet, CORS y los ficheros
// estáticos, que no cambian lo que se prueba aquí.
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // listen(0) —y no init()— porque Socket.IO necesita un servidor HTTP real al que
  // engancharse: con init() los gateways no aceptan conexiones. El 0 pide al SO un
  // puerto libre cualquiera.
  await app.listen(0);
  const server = app.getHttpServer();
  const { port } = server.address() as AddressInfo;

  // Se paran los @Cron del ciclo de vida de subastas (abrir, cerrar, impagos,
  // aviso de cierre). Si siguieran vivos, una pasada del cron podría cerrar en
  // mitad de un test la subasta que el test acaba de crear, y el fallo aparecería
  // de forma intermitente. Los tests que quieran probar el ciclo de vida llaman al
  // método del servicio a mano, que es además cómo se prueba sin esperar un minuto.
  const scheduler = app.get(SchedulerRegistry);
  for (const job of scheduler.getCronJobs().values()) {
    void job.stop();
  }

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    port,
    close: async () => {
      await app.close();
    },
  };
}

// Vacía todas las tablas de datos entre tests. Se descubren desde el catálogo de
// Postgres en vez de listarlas a mano para que no haya que tocar este fichero cada
// vez que el esquema crezca (y para que nadie olvide hacerlo, dejando datos de un
// test filtrándose al siguiente).
//
// TRUNCATE ... CASCADE ignora el orden de las claves ajenas, así que no hace falta
// borrar en orden topológico. Se excluye `_prisma_migrations`: borrarla haría que
// Prisma creyera que el esquema está sin migrar.
//
// Como todos los ficheros e2e comparten UNA base de datos, este borrado global
// obliga a correrlos en serie: por eso jest-e2e.json fija `maxWorkers: 1`. Si algún
// día los e2e tardan demasiado, la salida es dar una BD por worker (con el índice
// del worker en el nombre), no quitar el reset.
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

// Firma un access token válido para el handshake del WebSocket. Usa el JwtService
// de la propia aplicación, así que comparte secreto y configuración con el gateway
// por construcción: si mañana cambia el secreto o el algoritmo, los tests siguen
// firmando bien sin tocarlos.
export function signAccessToken(
  app: INestApplication,
  user: { id: string; email: string; role: string },
): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };
  return app.get(JwtService).sign(payload);
}
