import { IsEmail, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Email no válido' })
  @MaxLength(254)
  email!: string;
}
