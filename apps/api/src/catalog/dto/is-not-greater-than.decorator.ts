import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// Validador de campo cruzado: exige que este número no supere al de otra propiedad
// del mismo DTO. Lo usamos para `discountCents <= priceCents` en producto y lote,
// devolviendo un 400 del ValidationPipe (más claro que validarlo suelto en el
// service). class-validator no trae comparación entre campos de fábrica, de ahí
// este decorador con `registerDecorator`.
export function IsNotGreaterThanProperty(
  property: string,
  options?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotGreaterThanProperty',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedProperty] = args.constraints as [string];
          const related = (args.object as Record<string, unknown>)[
            relatedProperty
          ];
          // Solo comparamos cuando ambos son números; si el otro campo falta o no
          // es número, dejamos que su propia validación (@IsInt) sea quien falle.
          if (typeof value !== 'number' || typeof related !== 'number') {
            return true;
          }
          return value <= related;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} no puede ser mayor que ${args.constraints[0]}`;
        },
      },
    });
  };
}
