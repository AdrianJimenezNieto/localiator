import { testDatabaseUrl } from './database';

// `setupFiles` de Jest: corre en CADA worker ANTES de que el fichero de test
// importe nada. Es el único momento seguro para fijar DATABASE_URL, porque
// PrismaClient la lee al construirse y AppModule se importa a continuación.
//
// Se escribe en process.env directamente (no vía ConfigModule) porque
// @nestjs/config NO pisa las variables que ya están en process.env: la de aquí
// gana sobre la del `.env` de la raíz, que es justo lo que queremos.
process.env.DATABASE_URL = testDatabaseUrl();

// Sin clave de Resend, MailService no envía nada y solo escribe en el log (ver su
// constructor). Se fuerza vacía por si el `.env` de desarrollo tuviera una real:
// un e2e no debe mandar correos de verdad.
delete process.env.RESEND_API_KEY;

// Secreto determinista para los JWT del handshake WebSocket. El harness firma los
// tokens con el JwtService de la propia app, así que basta con que exista.
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'e2e-insecure-secret';
