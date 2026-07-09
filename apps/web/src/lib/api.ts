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

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    // Intentamos leer el mensaje de error legible que devuelve NestJS.
    const message = await res
      .json()
      .then((body: { message?: string | string[] }) =>
        Array.isArray(body.message) ? body.message.join(', ') : body.message,
      )
      .catch(() => undefined);
    throw new ApiError(message ?? `Error ${res.status}`, res.status);
  }

  return res.json() as Promise<T>;
}
