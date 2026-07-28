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

// Datos que recoge el formulario de registro. Coinciden con los que valida el
// RegisterDto del backend (identidad, contacto y dirección de facturación).
// `phone` y `addressLine2` son opcionales; `birthDate` viaja como 'YYYY-MM-DD'.
export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  // `ready` en false mientras se intenta restaurar la sesión al cargar: evita
  // parpadeos y redirecciones antes de saber si hay sesión.
  ready: boolean;
  isAdmin: boolean;
  login: (
    email: string,
    password: string,
    turnstileToken?: string | null,
  ) => Promise<void>;
  register: (
    data: RegisterData,
    turnstileToken?: string | null,
  ) => Promise<void>;
  // Cambio de contraseña estando logueado. Vive en el contexto (y no en la página
  // con apiSend directo, como el reset por email) PRECISAMENTE porque toca el
  // estado de sesión: el backend revoca las sesiones y re-emite una nueva para
  // este dispositivo, devolviendo un accessToken nuevo que hay que guardar en
  // memoria para que los siguientes refresh funcionen.
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
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

  async function login(
    email: string,
    password: string,
    turnstileToken?: string | null,
  ) {
    // `website: ''` es el honeypot vacío que espera el AntiBotGuard; el
    // `turnstileToken` lo produce el widget de Turnstile (vacío/undefined en dev,
    // donde el backend no lo exige).
    const { accessToken } = await apiSend<{ accessToken: string }>(
      'POST',
      '/auth/login',
      { email, password, website: '', turnstileToken: turnstileToken || undefined },
    );
    const me = await apiGet<AuthUser>('/auth/me', accessToken);
    setToken(accessToken);
    setUser(me);
  }

  // Registro de comprador. NO inicia sesión: el backend crea la cuenta y envía el
  // email de verificación; hasta verificar no se puede comprar (política de la
  // Fase 3). `website: ''` es el honeypot vacío que espera el AntiBotGuard.
  async function register(
    data: RegisterData,
    turnstileToken?: string | null,
  ) {
    await apiSend('POST', '/auth/register', {
      ...data,
      website: '',
      turnstileToken: turnstileToken || undefined,
    });
  }

  async function changePassword(
    currentPassword: string,
    newPassword: string,
  ) {
    // Endpoint privado: no lleva honeypot ni Turnstile (a diferencia de los de
    // auth públicos). Mandamos el access token actual en la cabecera; el backend
    // reautentica con currentPassword. En éxito devuelve un accessToken nuevo
    // (la sesión anterior queda revocada) que guardamos en memoria.
    const { accessToken } = await apiSend<{ accessToken: string }>(
      'POST',
      '/auth/change-password',
      { currentPassword, newPassword },
      token ?? undefined,
    );
    setToken(accessToken);
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
      value={{
        user,
        token,
        ready,
        isAdmin,
        login,
        register,
        changePassword,
        logout,
      }}
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
