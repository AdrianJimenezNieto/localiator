import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';

// Emails transaccionales de SUBASTA (tarea 08): superado, ganado, a punto de
// cerrar y baneado por impago. Mismo enfoque que OrderMailService: aísla plantillas
// y carga de datos, delega el transporte en MailService (que abstrae Resend y, sin
// clave, registra en el log en vez de enviar) y es TOLERANTE A FALLOS: un fallo de
// email no debe romper el flujo de la subasta (la puja/cierre ya ocurrió), así que
// cada método captura y registra el error en vez de propagarlo.
//
// Estos emails son el canal de RESPALDO del WebSocket: garantizan que lo importante
// (te superaron, ganaste) llega aunque el usuario cerrara la pestaña.
@Injectable()
export class AuctionMailService {
  private readonly logger = new Logger(AuctionMailService.name);

  constructor(
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Te han superado: ya no eres el mejor postor. Solo se manda al perder el
  // liderato (no en cada puja), para no spamear.
  async sendOutbid(userId: string, auctionId: string): Promise<void> {
    const email = await this.emailOf(userId);
    if (!email) return;
    await this.safeSend(
      email,
      'Te han superado en una subasta',
      `<p>Alguien ha pujado más que tú en una subasta en la que participabas.</p>
       <p>Si aún te interesa, todavía puedes volver a pujar:</p>
       <p><a href="${this.auctionUrl(auctionId)}">Ver la subasta</a></p>`,
    );
  }

  // Has ganado: instrucciones de pago. `secondChance` distingue la segunda
  // oportunidad por impago del ganador anterior (tarea 07). El enlace de pago real
  // se conecta en la tarea 09; de momento lleva a la ficha de la subasta.
  async sendWon(
    userId: string,
    amountCents: number,
    secondChance: boolean,
  ): Promise<void> {
    const email = await this.emailOf(userId);
    if (!email) return;
    const intro = secondChance
      ? '<p>El ganador anterior no pagó a tiempo, así que la subasta pasa a ti: <strong>has ganado</strong>.</p>'
      : '<p>¡Enhorabuena! <strong>Has ganado la subasta.</strong></p>';
    await this.safeSend(
      email,
      'Has ganado una subasta — instrucciones de pago',
      `${intro}
       <p>Importe: <strong>${this.eur(amountCents)}</strong>.</p>
       <p>Completa el pago para asegurar tu artículo:</p>
       <p><a href="${this.myOrdersUrl()}">Pagar ahora</a></p>`,
    );
  }

  // Baneado por impago: el ganador dejó vencer el plazo de pago (tarea 07) y su
  // cuenta queda bloqueada para pujar.
  async sendBannedForNonPayment(userId: string): Promise<void> {
    const email = await this.emailOf(userId);
    if (!email) return;
    await this.safeSend(
      email,
      'Tu cuenta ha sido bloqueada por impago',
      `<p>No hemos recibido el pago de una subasta que ganaste dentro del plazo.</p>
       <p>Por ello, tu cuenta queda bloqueada para pujar en futuras subastas. Si
       crees que es un error, responde a este correo.</p>`,
    );
  }

  // A punto de cerrar: se avisa a todos los pujadores NO baneados de la subasta.
  // No excluimos al líder actual (el recordatorio es inofensivo y ahorra consultar
  // la puja máxima aquí). Distinct por usuario para no repetir email a quien pujó
  // varias veces.
  async sendEndingSoon(auctionId: string): Promise<void> {
    const bidders = await this.prisma.bid.findMany({
      where: { auctionId, user: { bannedAt: null } },
      distinct: ['userId'],
      select: { user: { select: { email: true } } },
    });
    for (const b of bidders) {
      await this.safeSend(
        b.user.email,
        'Una subasta está a punto de cerrar',
        `<p>Una subasta en la que participas cierra pronto.</p>
         <p>Si quieres mejorar tu puja, este es el momento:</p>
         <p><a href="${this.auctionUrl(auctionId)}">Ir a la subasta</a></p>`,
      );
    }
  }

  private async emailOf(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user?.email ?? null;
  }

  private auctionUrl(auctionId: string): string {
    return `${this.appUrl()}/subastas/${auctionId}`;
  }

  // Página "mis pedidos": ahí el ganador ve su pedido de subasta PENDING y lo paga
  // por el flujo Stripe existente (tarea 09). No enlazamos a un pedido concreto
  // porque el email no maneja el id del pedido; la lista basta para el MVP.
  private myOrdersUrl(): string {
    return `${this.appUrl()}/mis-pedidos`;
  }

  private appUrl(): string {
    return this.config.get<string>('APP_URL') ?? 'http://localhost:5173';
  }

  // Envuelve el envío para que un fallo se registre pero no rompa el flujo de
  // subasta que lo dispara.
  private async safeSend(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    try {
      await this.mail.send(to, subject, html);
    } catch (err) {
      this.logger.error(
        `No se pudo enviar el email de subasta a ${to}: ${err instanceof Error ? err.message : 'error'}`,
      );
    }
  }

  private eur(cents: number): string {
    return (cents / 100).toFixed(2) + ' €';
  }
}
