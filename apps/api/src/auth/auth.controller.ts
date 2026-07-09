import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AuthService, AuthenticatedUser } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  // Confirma la identidad. La emisión de tokens de sesión (access + refresh) se
  // añade en la tarea 09; de momento devuelve el usuario autenticado.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Inicia el flujo OAuth: el guard redirige a la pantalla de consentimiento de
  // Google. No hay cuerpo de handler porque el guard hace la redirección.
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Intencionadamente vacío.
  }

  // Google redirige aquí tras el consentimiento. El guard ejecuta la estrategia
  // (crea/vincula el usuario) y deja el AuthenticatedUser en req.user.
  // La emisión de la sesión (cookie + redirección al frontend) se añade en la
  // tarea 09; de momento devolvemos el usuario resuelto.
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(@Req() req: Request) {
    return req.user as AuthenticatedUser;
  }
}
