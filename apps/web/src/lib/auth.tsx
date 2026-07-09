import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { apiGet, apiSend } from './api';

// Identidad del usuario logueado, tal como la devuelve GET /auth/me.
export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  // `ready` en false mientras se intenta restaurar la sesión al cargar: evita
  // parpadeos y redirecciones antes de saber si hay sesión.
  ready: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// El access token vive SOLO en memoria (patrón decidido en CLAUDE.md); el refresh
// token va en la cookie HttpOnly y no es accesible desde JS. Al recargar la página
// el token en memoria se pierde, así que lo recuperamos pidiendo /auth/refresh
// (que usa la cookie) al arrancar.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { accessToken } = await apiSend<{ accessToken: string }>(
          'POST',
          '/auth/refresh',
        );
        const me = await apiGet<AuthUser>('/auth/me', accessToken);
        if (!cancelled) {
          setToken(accessToken);
          setUser(me);
        }
      } catch {
        // Sin cookie válida = sin sesión. Es el caso normal del visitante.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string) {
    // `website: ''` es el honeypot vacío que espera el AntiBotGuard. En dev sin
    // TURNSTILE_SECRET_KEY el CAPTCHA no bloquea; en producción habría que añadir
    // el widget de Turnstile (pendiente del frontend de auth de Fase 1).
    const { accessToken } = await apiSend<{ accessToken: string }>(
      'POST',
      '/auth/login',
      { email, password, website: '' },
    );
    const me = await apiGet<AuthUser>('/auth/me', accessToken);
    setToken(accessToken);
    setUser(me);
  }

  async function logout() {
    try {
      await apiSend('POST', '/auth/logout');
    } catch {
      // Aun si el logout remoto falla, limpiamos el estado local.
    }
    setToken(null);
    setUser(null);
  }

  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

  return (
    <AuthContext.Provider
      value={{ user, token, ready, isAdmin, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}
