import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

// Valida que una fecha de nacimiento (string ISO 'YYYY-MM-DD', tal como llega en
// el JSON) corresponde a una persona de al menos `minAge` años. Se usa en el
// registro para exigir mayoría de edad: comprar y pujar requieren ser mayor de
// edad. Se implementa como decorador propio porque class-validator no trae una
// comprobación de edad lista para usar.
export function IsAdult(minAge = 18, options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAdult',
      target: object.constructor,
      propertyName,
      constraints: [minAge],
      options: {
        message: `Debes tener al menos ${minAge} años`,
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          const birth = new Date(value);
          if (Number.isNaN(birth.getTime())) return false;

          const [min] = args.constraints as [number];
          // Fecha en la que la persona cumple `min` años. Comparar contra "ahora"
          // maneja bien meses y días (no basta con restar años). Usamos UTC para no
          // depender de la zona horaria del servidor.
          const threshold = new Date(
            Date.UTC(
              birth.getUTCFullYear() + min,
              birth.getUTCMonth(),
              birth.getUTCDate(),
            ),
          );
          return threshold.getTime() <= Date.now();
        },
      },
    });
  };
}
