import { PartialType } from '@nestjs/mapped-types';
import { CreateLotDto } from './create-lot.dto';

// Espejo del update de producto: campos opcionales sobre las reglas del create.
export class UpdateLotDto extends PartialType(CreateLotDto) {}
