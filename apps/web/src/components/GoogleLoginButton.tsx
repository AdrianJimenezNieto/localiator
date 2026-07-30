import { API_URL } from '../lib/api';

// Enlace (no fetch): tiene que ser una navegación top-level para que Google
// pinte su pantalla de consentimiento y para que la cookie `oauth_state`
// (SameSite=lax) se acepte al volver del callback.
export function GoogleLoginButton({ redirect }: { redirect: string }) {
  const href = `${API_URL}/auth/google?redirect=${encodeURIComponent(redirect)}`;

  return (
    <a
      href={href}
      className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-neutral-300 px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-50"
    >
      <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
        <path
          fill="#FFC107"
          d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
        />
        <path
          fill="#FF3D00"
          d="M6.3 14.7l6.6 4.8C14.6 15.6 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.5 0-14 4.2-17.3 10.4z"
        />
        <path
          fill="#4CAF50"
          d="M24 44c5.5 0 10.4-2.1 14.1-5.6l-6.5-5.5c-2 1.5-4.7 2.5-7.6 2.5-5.2 0-9.6-3.3-11.2-8l-6.5 5c3.3 6.4 9.9 10.9 17.7 10.9z"
        />
        <path
          fill="#1976D2"
          d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.5 5.5C41 35.8 44 30.4 44 24c0-1.3-.1-2.7-.4-3.5z"
        />
      </svg>
      Continuar con Google
    </a>
  );
}
