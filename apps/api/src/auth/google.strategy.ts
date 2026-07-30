import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from './auth.service';
import { OAuthStateStore } from './oauth-state.store';

// Estrategia OAuth 2.0 / OpenID Connect de Google vía Passport. NestJS la usa a
// través del guard AuthGuard('google').
//
// Nota: si faltan las credenciales (dev sin claves) usamos placeholders para que
// la app arranque igual; el login con Google simplemente no funcionará hasta que
// Adrián configure GOOGLE_CLIENT_ID/SECRET reales en .env.
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private static readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
    stateStore: OAuthStateStore,
  ) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');
    if (!clientID || !clientSecret) {
      GoogleStrategy.logger.warn(
        'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET no configurados: el login con Google no funcionará hasta poner credenciales reales.',
      );
    }

    super({
      // || (no ??): en .env estas claves suelen venir VACÍAS hasta que Adrián
      // configure Google; passport exige valores no vacíos para instanciarse. Con
      // los placeholders la app arranca, pero el login con Google no funcionará
      // hasta poner credenciales reales.
      clientID: clientID || 'placeholder-client-id',
      clientSecret: clientSecret || 'placeholder-secret',
      callbackURL:
        config.get<string>('GOOGLE_CALLBACK_URL') ||
        'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
      store: stateStore,
    });
  }

  // Passport llama a validate() tras intercambiar el código por el perfil. Lo que
  // devolvamos aquí queda en req.user. Delegamos el linking a AuthService.
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      // Sin email no podemos vincular ni crear la cuenta local.
      done(
        new UnauthorizedException('Google no proporcionó un email'),
        undefined,
      );
      return;
    }

    const user = await this.authService.validateOAuthLogin({
      provider: 'google',
      providerAccountId: profile.id, // el `sub` de Google.
      email,
    });
    done(null, user);
  }
}
