import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-product.dto';

// Todos los campos opcionales, reutilizando las reglas del create. Ojo: la
// validación cruzada descuento≤precio del DTO solo actúa si AMBOS llegan en el
// payload; cuando en un PATCH cambia solo uno, el service re-comprueba contra el
// valor persistido del otro.
export class UpdateProductDto extends PartialType(CreateProductDto) {}
