import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, apiSend } from '../lib/api';

// Destino del enlace del email de verificación: el backend construye la URL
// `${APP_URL}/verificar-email?token=...`. Al montar, canjeamos el token contra
// POST /auth/verify-email y mostramos el resultado. No pedimos confirmación al
// usuario: llegar aquí desde su correo ya es la acción.
type Status = 'loading' | 'success' | 'error';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  // StrictMode monta el efecto dos veces en desarrollo; el token es de un solo
  // uso, así que la segunda llamada fallaría. Este guard evita el doble canje.
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    if (!token) {
      setStatus('error');
      setMessage('El enlace no incluye ningún token de verificación.');
      return;
    }

    void (async () => {
      try {
        const res = await apiSend<{ message: string }>(
          'POST',
          '/auth/verify-email',
          { token },
        );
        setStatus('success');
        setMessage(res.message);
      } catch (err) {
        setStatus('error');
        setMessage(
          err instanceof ApiError
            ? err.message
            : 'No se pudo verificar el email.',
        );
      }
    })();
  }, [token]);

  return (
    <div className="mx-auto max-w-sm px-4 py-16 text-center">
      {status === 'loading' && (
        <>
          <h1 className="mb-2 text-2xl font-bold">Verificando tu email…</h1>
          <p className="text-ink-600">Un momento, por favor.</p>
        </>
      )}

      {status === 'success' && (
        <>
          <h1 className="mb-2 text-2xl font-bold">¡Email verificado!</h1>
          <p className="mb-6 text-ink-600">{message}</p>
          <Link to="/login" className="text-ink-900 underline">
            Iniciar sesión
          </Link>
        </>
      )}

      {status === 'error' && (
        <>
          <h1 className="mb-2 text-2xl font-bold">No se pudo verificar</h1>
          <p className="mb-6 text-ink-600">{message}</p>
          <p className="text-sm text-ink-600">
            El enlace puede haber caducado (válido 2 días).{' '}
            <Link
              to="/reenviar-verificacion"
              className="underline hover:text-ink-900"
            >
              Solicita uno nuevo
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
