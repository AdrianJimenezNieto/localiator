import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

// Página de error genérica: la usa el router como `errorElement`. React Router la
// pinta cuando algo revienta al renderizar una ruta (o un loader lanza un error),
// que es el equivalente en el cliente al "500 Internal Server Error" del servidor.
// Como reemplaza al layout entero, incluye su propio enlace de vuelta con <a> (no
// <Link>): tras un fallo de enrutado, un enlace normal es la salida más fiable.
export function ErrorPage() {
  const error = useRouteError();

  // Si un loader devolvió una respuesta HTTP de error (404/500…), aprovechamos su
  // código; si no, es un fallo de render y mostramos un 500 genérico.
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const title = status === 404 ? 'Página no encontrada' : 'Algo ha ido mal';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 text-center text-neutral-900">
      <p className="mb-2 text-5xl font-bold text-neutral-300">{status}</p>
      <h1 className="mb-2 text-2xl font-bold">{title}</h1>
      <p className="mb-6 text-neutral-600">
        Ha ocurrido un error inesperado. Inténtalo de nuevo en unos minutos.
      </p>
      <a href="/" className="text-neutral-900 underline">
        Volver al inicio
      </a>
    </div>
  );
}
