import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

// Registro de COMPRADOR. Tras registrarse NO se inicia sesión: el backend envía
// un email de verificación y hasta verificar no se puede comprar (política de la
// Fase 3). Por eso, en éxito, mostramos un aviso en vez de redirigir.
export function RegisterPage() {
  const { register } = useAuth();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar');
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
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Crear cuenta</h1>
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
          <p className="mt-1 text-xs text-neutral-500">
            Mínimo 8 caracteres, con mayúscula, minúscula y número.
          </p>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
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
