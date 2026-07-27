import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiSend } from '../lib/api';
import { TurnstileWidget } from '../components/TurnstileWidget';

// Reenvío del email de verificación cuando el enlace ha caducado (o no llegó). El
// backend responde SIEMPRE lo mismo, exista la cuenta o no (anti-enumeración), así
// que aquí también mostramos un aviso neutro en éxito.
export function ResendVerificationPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // Igual que en registro/login: el token de Turnstile es de un solo uso; null
  // bloquea el envío mientras el CAPTCHA no esté resuelto (vacío en dev sin sitekey).
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiSend('POST', '/auth/resend-verification', {
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
        <p className="mb-6 text-neutral-600">
          Si tu cuenta existe y aún no está verificada, te hemos enviado un nuevo
          enlace de verificación (válido 2 días).
        </p>
        <Link to="/login" className="text-neutral-900 underline">
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">Reenviar verificación</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Introduce tu email y te enviaremos un nuevo enlace para verificar tu
        cuenta.
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
            className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-neutral-900 focus:outline-none"
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
          className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Enviando…' : 'Enviar enlace'}
        </button>
      </form>

      <p className="mt-4 text-sm text-neutral-600">
        <Link to="/login" className="underline hover:text-neutral-900">
          Volver a iniciar sesión
        </Link>
      </p>
    </div>
  );
}
