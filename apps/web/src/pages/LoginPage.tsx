import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { TurnstileWidget } from '../components/TurnstileWidget';
import { GoogleLoginButton } from '../components/GoogleLoginButton';

// Login de COMPRADOR. Igual que el de admin pero vuelve a donde el usuario quería
// ir (?redirect=…), para no perder el checkout tras iniciar sesión. El carrito
// sobrevive solo (localStorage), así que no hay que preservarlo aquí.
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') ?? '/';
  const oauthError = params.get('error') === 'oauth';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // El backend bloquea con 403 el login de una cuenta sin verificar pasado el día
  // de gracia; en ese caso ofrecemos el enlace para reenviar la verificación.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Token del CAPTCHA: null bloquea el envío; '' en dev sin sitekey. resetKey
  // fuerza un nuevo CAPTCHA tras un fallo (el token es de un solo uso).
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setSubmitting(true);
    try {
      await login(email, password, turnstileToken);
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo iniciar sesión',
      );
      if (err instanceof ApiError && err.status === 403) {
        setNeedsVerification(true);
      }
      setTurnstileReset((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Iniciar sesión</h1>

      {oauthError && (
        <p
          className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          No se pudo iniciar sesión con Google, prueba con tu email.
        </p>
      )}

      <GoogleLoginButton redirect={redirect} />

      <div className="my-4 flex items-center gap-3 text-sm text-neutral-400">
        <div className="h-px flex-1 bg-neutral-200" />
        o
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

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
            className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-neutral-900 focus:outline-none"
          />
        </div>

        <TurnstileWidget
          onVerify={setTurnstileToken}
          resetKey={turnstileReset}
        />

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            <p>{error}</p>
            {needsVerification && (
              <Link
                to="/reenviar-verificacion"
                className="mt-1 inline-block font-medium underline"
              >
                Reenviar email de verificación
              </Link>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || turnstileToken === null}
          className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="mt-4 text-sm text-neutral-600">
        <Link
          to="/recuperar-password"
          className="underline hover:text-neutral-900"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </p>

      <p className="mt-2 text-sm text-neutral-600">
        ¿No tienes cuenta?{' '}
        <Link
          to={`/registro?redirect=${encodeURIComponent(redirect)}`}
          className="underline hover:text-neutral-900"
        >
          Crear una
        </Link>
      </p>
    </div>
  );
}
