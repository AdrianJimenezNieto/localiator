import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoryDto } from './create-category.dto';

// PartialType hace opcionales todos los campos del create reutilizando sus reglas
// de validación: no duplicamos la validación entre crear y editar.
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
