import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateAuctionDto } from './create-auction.dto';

// Edición de subasta (tarea 11). Reutiliza las reglas de forma del alta, pero el
// ARTÍCULO no se puede cambiar: repuntar una subasta a otro producto a mitad de
// camino cambiaría lo que la gente creía estar pujando. Si el artículo estaba mal,
// se cancela la subasta y se crea otra.
//
// Qué campos son editables SEGÚN EL ESTADO lo decide el servicio (una LIVE con
// pujas congela precio de salida e incremento): eso es regla de negocio, no forma.
export class UpdateAuctionDto extends PartialType(
  OmitType(CreateAuctionDto, ['itemType', 'itemId'] as const),
) {}
