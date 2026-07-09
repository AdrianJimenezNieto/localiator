import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

// Guarda de ruta del backoffice. La protección REAL la impone el backend
// (@Roles(ADMIN) en cada endpoint); esto es solo UX: oculta/redirige la UI para
// no mostrar pantallas que igualmente fallarían. Nunca se confía solo en el
// cliente.
export function ProtectedAdmin() {
  const { ready, isAdmin } = useAuth();

  // Mientras se restaura la sesión no decidimos nada (evita un redirect en falso).
  if (!ready) {
    return <p className="p-8 text-center text-neutral-500">Cargando…</p>;
  }

  if (!isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
