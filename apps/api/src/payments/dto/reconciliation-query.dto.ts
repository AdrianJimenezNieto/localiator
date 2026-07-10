import { IsISO8601, IsOptional } from 'class-validator';

// Rango de fechas del informe de conciliación. Ambos opcionales: si faltan, el
// servicio usa por defecto los últimos 30 días. Se validan como ISO-8601 para no
// pasar basura a la consulta de Stripe.
export class ReconciliationQueryDto {
  @IsOptional()
  @IsISO8601({}, { message: 'from debe ser una fecha ISO-8601' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'to debe ser una fecha ISO-8601' })
  to?: string;
}
