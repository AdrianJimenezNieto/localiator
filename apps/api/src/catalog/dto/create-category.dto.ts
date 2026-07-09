import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// Validación estricta del alta de categoría (la aplica el ValidationPipe global).
export class CreateCategoryDto {
  @IsString()
  @MinLength(1, { message: 'El nombre no puede estar vacío' })
  @MaxLength(80)
  name!: string;

  // Opcional: si no viene, el service lo autogenera a partir del `name`. Si viene,
  // se exige ya en formato kebab-case para no aceptar slugs raros por API.
  @IsOptional()
  @IsString()
  @MaxLength(90)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'El slug debe ser kebab-case (minúsculas, números y guiones)',
  })
  slug?: string;

  // Opcional: id de la categoría padre (subcategorías). El service valida que exista.
  @IsOptional()
  @IsString()
  parentId?: string;
}
