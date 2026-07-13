import { IsInt, Max, Min } from 'class-validator';

// Tope defensivo: acota la puja para evitar valores absurdos (1.000.000 €). La
// regla de negocio real (superar la máxima + incremento, subasta abierta) NO va
// aquí sino en el servicio, que es donde se puede comparar con datos de BD.
export const MAX_BID_CENTS = 100_000_000;

// Una puja tal como llega del cliente: solo el importe. Ni el usuario ni la
// subasta viajan en el body (el usuario sale del JWT; la subasta, de la ruta).
export class PlaceBidDto {
  @IsInt()
  @Min(1)
  @Max(MAX_BID_CENTS)
  amountCents!: number;
}
