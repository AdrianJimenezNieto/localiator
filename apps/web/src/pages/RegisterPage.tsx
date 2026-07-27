import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth, type RegisterData } from '../lib/auth';
import { TurnstileWidget } from '../components/TurnstileWidget';

// Estado inicial del formulario: los mismos campos que espera RegisterData. El
// país por defecto es España (el negocio es solo España, recogida en almacén).
const EMPTY: RegisterData = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  birthDate: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  postalCode: '',
  city: '',
  province: '',
  country: 'ES',
};

// Registro de COMPRADOR. Tras registrarse NO se inicia sesión: el backend envía
// un email de verificación y hasta verificar no se puede comprar (política de la
// Fase 3). Por eso, en éxito, mostramos un aviso en vez de redirigir. Además de
// las credenciales pedimos los datos personales necesarios para facturar.
export function RegisterPage() {
  const { register } = useAuth();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') ?? '/';

  const [form, setForm] = useState<RegisterData>(EMPTY);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // Token del CAPTCHA: null mientras no esté resuelto (bloquea el envío); '' en
  // dev sin sitekey (no bloquea). resetKey fuerza un nuevo CAPTCHA tras un fallo.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  // Actualiza un campo del formulario por su clave, manteniendo el resto.
  function set<K extends keyof RegisterData>(key: K, value: RegisterData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // Coincidencia de contraseñas: solo en el frontend (evita erratas); el backend
    // no necesita el campo de confirmación.
    if (form.password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setSubmitting(true);
    try {
      // Teléfono y 2ª línea de dirección son opcionales: si van vacíos, no los
      // enviamos (así el backend no valida un string vacío contra su regex).
      const payload: RegisterData = {
        ...form,
        phone: form.phone?.trim() ? form.phone.trim() : undefined,
        addressLine2: form.addressLine2?.trim()
          ? form.addressLine2.trim()
          : undefined,
      };
      await register(payload, turnstileToken);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar');
      // El token de Turnstile es de un solo uso: tras un fallo, pide otro.
      setTurnstileReset((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">Revisa tu email</h1>
        <p className="mb-6 text-neutral-600">
          Te hemos enviado un enlace para verificar tu cuenta. Cuando la
          verifiques podrás iniciar sesión y comprar.
        </p>
        <Link
          to={`/login?redirect=${encodeURIComponent(redirect)}`}
          className="text-neutral-900 underline"
        >
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Crear cuenta</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field id="email" label="Email">
          <input
            id="email"
            type="email"
            required
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="password" label="Contraseña">
            <input
              id="password"
              type="password"
              required
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="confirmPassword" label="Repetir contraseña">
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-neutral-500">
          Mínimo 10 caracteres, con al menos una letra, un número y un carácter
          especial.
        </p>

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

        <fieldset className="mt-2 flex flex-col gap-4 border-t border-neutral-200 pt-4">
          <legend className="text-sm font-semibold text-neutral-700">
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

        <TurnstileWidget onVerify={setTurnstileToken} resetKey={turnstileReset} />

        {error && (
          <p
            className="rounded-md bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || turnstileToken === null}
          className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>

      <p className="mt-4 text-sm text-neutral-600">
        ¿Ya tienes cuenta?{' '}
        <Link
          to={`/login?redirect=${encodeURIComponent(redirect)}`}
          className="underline hover:text-neutral-900"
        >
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}

// Clases compartidas por todos los inputs (mismo estilo que el resto de formularios).
const inputClass =
  'w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-neutral-900 focus:outline-none';

// Envoltorio label + control, para no repetir la estructura en cada campo.
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
