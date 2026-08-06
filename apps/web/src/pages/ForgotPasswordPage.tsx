import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiSend } from '../lib/api';
import { TurnstileWidget } from '../components/TurnstileWidget';

// Solicitud de "he olvidado mi contraseña": pedimos el email y el backend, si la
// cuenta existe, manda un enlace de reset (TTL 1 h). Igual que el reenvío de
// verificación, la respuesta es SIEMPRE neutra (anti-enumeración), así que en
// éxito mostramos un aviso genérico sin revelar si la cuenta existe.
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // El token de Turnstile es de un solo uso; null bloquea el envío mientras el
  // CAPTCHA no esté resuelto (vacío en dev sin sitekey).
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiSend('POST', '/auth/forgot-password', {
        email,
        website: '', // honeypot vacío que espera el AntiBotGuard.
        turnstileToken: turnstileToken || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo enviar el correo.',
      );
      setTurnstileReset((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">Revisa tu email</h1>
        <p className="mb-6 text-ink-600">
          Si el email corresponde a una cuenta, te hemos enviado un enlace para
          restablecer tu contraseña (válido 1 hora).
        </p>
        <Link to="/login" className="text-ink-900 underline">
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">Recuperar contraseña</h1>
      <p className="mb-6 text-sm text-ink-600">
        Introduce tu email y te enviaremos un enlace para elegir una contraseña
        nueva.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none"
          />
        </div>

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
          className="min-h-11 rounded-md bg-ink-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Enviando…' : 'Enviar enlace'}
        </button>
      </form>

      <p className="mt-4 text-sm text-ink-600">
        <Link to="/login" className="underline hover:text-ink-900">
          Volver a iniciar sesión
        </Link>
      </p>
    </div>
  );
}
