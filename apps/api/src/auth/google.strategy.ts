import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from './auth.service';

// Estrategia OAuth 2.0 / OpenID Connect de Google vía Passport. NestJS la usa a
// través del guard AuthGuard('google').
//
// Nota: si faltan las credenciales (dev sin claves) usamos placeholders para que
// la app arranque igual; el login con Google simplemente no funcionará hasta que
// Adrián configure GOOGLE_CLIENT_ID/SECRET reales en .env.
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID:
        config.get<string>('GOOGLE_CLIENT_ID') ?? 'placeholder-client-id',
      clientSecret:
        config.get<string>('GOOGLE_CLIENT_SECRET') ?? 'placeholder-secret',
      callbackURL:
        config.get<string>('GOOGLE_CALLBACK_URL') ??
        'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
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
