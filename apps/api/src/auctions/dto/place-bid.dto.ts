import { IsInt, Max, Min } from 'class-validator';

// Tope defensivo: acota la puja para evitar valores absurdos (1.000.000 €). La
// regla de negocio real (superar la máxima + incremento, subasta abierta) NO va
// aquí sino en el servicio, que es donde se puede comparar con datos de BD.
export const MAX_BID_CENTS = 100_000_000;

// Una puja tal como llega del cliente. Ni el usuario ni la subasta viajan en el
// body (el usuario sale del JWT; la subasta, de la ruta).
//
// OJO: con puja proxy el cliente NO manda lo que quiere pujar, manda su MÁXIMO.
// Cuánto se puja de verdad lo decide el servidor (ver auctions.proxy.ts). El campo
// se llama `maxAmountCents` y no `amountCents` justamente para que no se pueda
// confundir una cosa con la otra al leer el código.
export class PlaceBidDto {
  @IsInt()
  @Min(1)
  @Max(MAX_BID_CENTS)
  maxAmountCents!: number;
}
