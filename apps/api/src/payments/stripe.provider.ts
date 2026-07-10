import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

// Token de inyección del cliente Stripe. Se inyecta así (en vez de instanciar
// Stripe dentro del servicio) para poder SUSTITUIRLO por un mock en los tests,
// igual que se aísla Resend en el MailService.
export const STRIPE_CLIENT = 'STRIPE_CLIENT';

// El cliente es null si no hay STRIPE_SECRET_KEY (desarrollo/CI/tests sin claves).
// El servicio de pago lo comprueba y responde un error claro en vez de reventar
// al arrancar, igual que el MailService funciona sin RESEND_API_KEY.
export type StripeClient = Stripe | null;

export const stripeProvider: Provider = {
  provide: STRIPE_CLIENT,
  useFactory: (config: ConfigService): StripeClient => {
    const key = config.get<string>('STRIPE_SECRET_KEY');
    return key ? new Stripe(key) : null;
  },
  inject: [ConfigService],
};
