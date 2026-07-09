import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

// Servicio de email transaccional sobre Resend (decidido en CLAUDE.md). Se aísla
// aquí para: (1) que el dominio de auth no dependa del SDK concreto, (2) poder
// mockearlo en tests, (3) cambiar de proveedor sin tocar la lógica de negocio.
//
// Si no hay RESEND_API_KEY (desarrollo local, CI, tests), no se envía nada: se
// registra el enlace en el log. Así el flujo completo funciona sin credenciales
// reales y Adrián puede conectar la clave cuando quiera envíos de verdad.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from =
      this.config.get<string>('MAIL_FROM') ??
      'Localiator <onboarding@resend.dev>';
  }

  async sendEmailVerification(to: string, verifyUrl: string): Promise<void> {
    await this.send(
      to,
      'Verifica tu email en Localiator',
      `<p>Bienvenido a Localiator.</p>
       <p>Confirma tu dirección de email pulsando en el enlace (caduca en 24 h):</p>
       <p><a href="${verifyUrl}">Verificar mi email</a></p>`,
    );
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    await this.send(
      to,
      'Restablece tu contraseña de Localiator',
      `<p>Has solicitado restablecer tu contraseña.</p>
       <p>Elige una nueva pulsando en el enlace (caduca en 1 h):</p>
       <p><a href="${resetUrl}">Restablecer contraseña</a></p>
       <p>Si no has sido tú, ignora este correo.</p>`,
    );
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY ausente; email NO enviado a ${to}. Asunto: "${subject}".`,
      );
      this.logger.debug(html);
      return;
    }
    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html,
    });
    if (error) {
      // No propagamos detalles al usuario, pero sí lo dejamos trazado.
      this.logger.error(`Fallo al enviar email a ${to}: ${error.message}`);
      throw new Error('No se pudo enviar el email');
    }
  }
}
