import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

// Aterrizaje tras `/auth/google/callback`. El backend ya dejó la cookie de
// refresh puesta y redirigió aquí; el AuthProvider se encarga solo de
// rehidratar la sesión (POST /auth/refresh + GET /auth/me) al montar, así que
// esta página solo espera a que `ready` sea true y decide a dónde ir.
export function OAuthCallbackPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    navigate(user ? '/' : '/login?error=oauth', { replace: true });
  }, [ready, user, navigate]);

  return (
    <div className="mx-auto max-w-sm px-4 py-16 text-center text-neutral-600">
      Iniciando sesión…
    </div>
  );
}
