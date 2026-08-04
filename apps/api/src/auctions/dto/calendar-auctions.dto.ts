import { IsDateString } from 'class-validator';

// Ventana máxima que se puede pedir de una vez, en días. El calendario NO pagina
// (necesita el mes entero para pintar la rejilla), así que este tope es lo único
// que impide que alguien pida `from=2000&to=2100` y se traiga la tabla completa:
// cumple el mismo papel que MAX_AUCTION_PAGE_SIZE en list-auctions.dto.ts.
//
// 62 días = dos meses largos. Es holgado a propósito: una rejilla mensual arrastra
// los días de relleno del mes anterior y el siguiente, así que un "mes" real pedido
// por el front puede llegar a ~42 días.
export const MAX_CALENDAR_RANGE_DAYS = 62;
export const MAX_CALENDAR_RANGE_MS = MAX_CALENDAR_RANGE_DAYS * 24 * 60 * 60_000;

// Rango de fechas del calendario público de subastas. Solo valida la FORMA (que
// sean fechas ISO); la coherencia entre ambas (que `to` sea posterior a `from` y
// que la ventana no se pase del tope) la comprueba el servicio, que es donde se
// puede testear con datos. Mismo criterio que CreateAuctionDto.
export class CalendarAuctionsDto {
  @IsDateString({}, { message: 'La fecha de inicio del rango no es válida' })
  from!: string;

  @IsDateString({}, { message: 'La fecha de fin del rango no es válida' })
  to!: string;
}
