// Cliente HTTP fino sobre fetch. Centraliza la URL base de la API y el manejo de
// errores para que las páginas no repitan ese boilerplate. `credentials: include`
// para que viaje la cookie de sesión cuando haga falta (rutas privadas del admin).

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Construye una query string a partir de un objeto, omitiendo valores vacíos y
// desplegando los arrays en claves repetidas (?condition=NEW&condition=GOOD).
export function toQuery(
  params: Record<string, string | number | string[] | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, v);
    } else {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

// Lanza un ApiError con el mensaje legible de NestJS a partir de una respuesta
// no-ok. Compartido por todas las llamadas.
async function toApiError(res: Response): Promise<ApiError> {
  const message = await res
    .json()
    .then((body: { message?: string | string[] }) =>
      Array.isArray(body.message) ? body.message.join(', ') : body.message,
    )
    .catch(() => undefined);
  return new ApiError(message ?? `Error ${res.status}`, res.status);
}

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<T>;
}

type Method = 'POST' | 'PATCH' | 'DELETE';

// Llamada con cuerpo JSON y (opcional) token de acceso en la cabecera. Se usa en
// el backoffice y en el login. Devuelve el JSON parseado, o null si la respuesta
// no trae cuerpo (p. ej. algunos DELETE).
export async function apiSend<T>(
  method: Method,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// Subida de un archivo (multipart) al endpoint de fotos. No fijamos Content-Type:
// el navegador pone el boundary del multipart automáticamente.
export async function apiUpload(
  path: string,
  file: File,
  token?: string,
): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    body: form,
  });
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<{ url: string }>;
}
