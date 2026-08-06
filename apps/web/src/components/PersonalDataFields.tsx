import type { ReactNode } from 'react';
import type { PersonalData } from '../lib/auth';

// Campos de identidad + dirección de facturación, compartidos entre el
// registro (RegisterPage) y el formulario de "completar perfil" del checkout
// (para cuentas creadas por Google, que llegan sin estos datos).
export function PersonalDataFields<T extends PersonalData>({
  form,
  set,
}: {
  form: T;
  set: <K extends keyof T>(key: K, value: T[K]) => void;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="firstName" label="Nombre">
          <input
            id="firstName"
            required
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field id="lastName" label="Apellidos">
          <input
            id="lastName"
            required
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="birthDate" label="Fecha de nacimiento">
          <input
            id="birthDate"
            type="date"
            required
            value={form.birthDate}
            onChange={(e) => set('birthDate', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field id="phone" label="Teléfono (opcional)">
          <input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <fieldset className="mt-2 flex flex-col gap-4 border-t border-ink-200 pt-4">
        <legend className="text-sm font-semibold text-ink-700">
          Dirección de facturación
        </legend>

        <Field id="addressLine1" label="Dirección">
          <input
            id="addressLine1"
            required
            placeholder="Calle y número"
            value={form.addressLine1}
            onChange={(e) => set('addressLine1', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field id="addressLine2" label="Piso, puerta… (opcional)">
          <input
            id="addressLine2"
            value={form.addressLine2}
            onChange={(e) => set('addressLine2', e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="postalCode" label="Código postal">
            <input
              id="postalCode"
              required
              inputMode="numeric"
              value={form.postalCode}
              onChange={(e) => set('postalCode', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="city" label="Localidad">
            <input
              id="city"
              required
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="province" label="Provincia">
            <input
              id="province"
              required
              value={form.province}
              onChange={(e) => set('province', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="country" label="País">
            <select
              id="country"
              required
              value={form.country}
              onChange={(e) => set('country', e.target.value)}
              className={inputClass}
            >
              <option value="ES">España</option>
              <option value="PT">Portugal</option>
              <option value="FR">Francia</option>
              <option value="AD">Andorra</option>
            </select>
          </Field>
        </div>
      </fieldset>
    </>
  );
}

const inputClass =
  'w-full rounded-md border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none';

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
