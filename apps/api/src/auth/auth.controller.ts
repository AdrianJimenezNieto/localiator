import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService, AuthenticatedUser } from './auth.service';
import { SessionService, IssuedSession } from './session.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { RequestUser } from './jwt.strategy';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { LoginDto } from './dto/login.dto';

// Nombre de la cookie del refresh token. Path acotado a /auth: la cookie solo se
// envía a los endpoints de sesión (refresh, logout), no a toda la API → menos
// superficie de exposición.
const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/auth';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly session: SessionService,
    private readonly config: ConfigService,
  ) {}

  // 200 (no 201): no revelamos si se ha creado o no un recurso, coherente con la
  // respuesta neutra que evita enumeración de usuarios.
  @Post('register')
  @HttpCode(HttpStatus.OK)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  // Login local: confirma identidad, emite la sesión (cookie + access token) y
  // devuelve el access token en el body para que el cliente lo guarde en memoria.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.login(dto);
    const session = await this.session.issue(user, this.meta(req));
    return this.respondWithSession(res, session);
  }

  // Renueva el access token usando el refresh de la cookie y ROTA el refresh
  // (emite uno nuevo, revoca el anterior). Ver detección de reutilización en
  // SessionService.
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.readRefreshCookie(req);
    const session = await this.session.rotate(token, this.meta(req));
    return this.respondWithSession(res, session);
  }

  // Cierra la sesión: revoca el refresh en BD (logout real) y borra la cookie.
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (token) {
      await this.session.revoke(token);
    }
    this.clearRefreshCookie(res);
    return { message: 'Sesión cerrada' };
  }

  // Ruta protegida de ejemplo/utilidad: devuelve el usuario del access token.
  // Sirve al frontend para saber quién está logueado y valida el JwtAuthGuard.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: RequestUser) {
    return user;
  }

  // Inicia el flujo OAuth: el guard redirige a la pantalla de consentimiento de
  // Google. No hay cuerpo de handler porque el guard hace la redirección.
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Intencionadamente vacío.
  }

  // Google redirige aquí tras el consentimiento. El guard resuelve/crea el usuario
  // (req.user); emitimos la sesión, dejamos el refresh en la cookie y redirigimos
  // al frontend. El access token NO va en la URL (se filtraría en logs/historial):
  // el frontend lo pedirá con /auth/refresh usando la cookie recién puesta.
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as AuthenticatedUser;
    const session = await this.session.issue(user, this.meta(req));
    this.setRefreshCookie(res, session);
    const appUrl =
      this.config.get<string>('APP_URL') ?? 'http://localhost:5173';
    res.redirect(`${appUrl}/oauth/callback`);
  }

  // --- Helpers de cookie/sesión ---

  private respondWithSession(res: Response, session: IssuedSession) {
    this.setRefreshCookie(res, session);
    return { accessToken: session.accessToken, user: session.user };
  }

  private readRefreshCookie(req: Request): string {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) {
      throw new UnauthorizedException('Sesión no válida');
    }
    return token;
  }

  private setRefreshCookie(res: Response, session: IssuedSession) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.baseCookieOptions(),
      expires: session.refreshExpiresAt,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, this.baseCookieOptions());
  }

  private baseCookieOptions(): CookieOptions {
    return {
      httpOnly: true, // JS no puede leerla → protege de XSS.
      secure: this.config.get('NODE_ENV') === 'production', // solo HTTPS en prod.
      sameSite: 'lax', // frena CSRF; 'lax' permite el redirect de OAuth (nav top-level).
      path: REFRESH_COOKIE_PATH,
    };
  }

  private meta(req: Request) {
    return { userAgent: req.headers['user-agent'], ip: req.ip };
  }
}
