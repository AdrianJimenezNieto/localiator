import { IsEmail, MaxLength } from 'class-validator';
import { AntiBotDto } from './anti-bot.dto';

// Hereda de AntiBotDto los campos honeypot/turnstile (tarea 05).
export class ForgotPasswordDto extends AntiBotDto {
  @IsEmail({}, { message: 'Email no válido' })
  @MaxLength(254)
  email!: string;
}
