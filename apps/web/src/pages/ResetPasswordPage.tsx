import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, apiSend } from '../lib/api';
import { TurnstileWidget } from '../components/TurnstileWidget';

// Destino del enlace del email de reset: el backend construye la URL
// `${APP_URL}/restablecer-password?token=...` (por eso la ruta ha de llamarse
// exactamente así). Leemos el token de la query y, con él, enviamos la nueva
// contraseña a POST /auth/reset-password. En éxito el backend revoca TODAS las
// sesiones, así que redirigimos a /login (no auto-login: es lo correcto de
// seguridad, expulsa a quien hubiera robado la cuenta).
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // Token del CAPTCHA: null bloquea el envío; '' en dev sin sitekey. resetKey
  // fuerza un nuevo CAPTCHA tras un fallo (el token es de un solo uso).
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // Coincidencia de contraseñas: solo en el frontend (evita erratas); el
    // backend valida la política (longitud, letra + número + carácter especial).
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setSubmitting(true);
    try {
      await apiSend('POST', '/auth/reset-password', {
        token,
        newPassword: password,
        website: '', // honeypot vacío que espera el AntiBotGuard.
        turnstileToken: turnstileToken || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo restablecer la contraseña.',
      );
      setTurnstileReset((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  }

  // Sin token no hay nada que hacer: el enlace del email debe traerlo siempre.
  if (!token) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">Enlace no válido</h1>
        <p className="mb-6 text-ink-600">
          Este enlace no incluye ningún token para restablecer la contraseña.
        </p>
        <Link to="/recuperar-password" className="text-ink-900 underline">
          Pedir un enlace nuevo
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">Contraseña actualizada</h1>
        <p className="mb-6 text-ink-600">
          Hemos cambiado tu contraseña y cerrado todas las sesiones abiertas.
          Vuelve a iniciar sesión con la nueva contraseña.
        </p>
        <Link to="/login" className="text-ink-900 underline">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">Nueva contraseña</h1>
      <p className="mb-6 text-sm text-ink-600">
        Elige una contraseña nueva para tu cuenta.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-1 block text-sm font-medium"
          >
            Repetir contraseña
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-md border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none"
          />
        </div>
        <p className="-mt-2 text-xs text-ink-500">
          Mínimo 10 caracteres, con al menos una letra, un número y un carácter
          especial.
        </p>

        <TurnstileWidget onVerify={setTurnstileToken} resetKey={turnstileReset} />

        {error && (
          <p
            className="rounded-md bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}{' '}
            <Link
              to="/recuperar-password"
              className="font-medium underline"
            >
              Pedir un enlace nuevo
            </Link>
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || turnstileToken === null}
          className="min-h-11 rounded-md bg-ink-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </form>
    </div>
  );
}
