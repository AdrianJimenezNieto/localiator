import { Link } from 'react-router-dom';

// Página 404: la pinta la ruta comodín `*`, que captura cualquier URL que no
// coincida con ninguna ruta definida. Va DENTRO del layout (App), así que conserva
// cabecera y pie.
export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="mb-2 text-5xl font-bold text-neutral-300">404</p>
      <h1 className="mb-2 text-2xl font-bold">Página no encontrada</h1>
      <p className="mb-6 text-neutral-600">
        La página que buscas no existe o se ha movido.
      </p>
      <Link to="/" className="text-neutral-900 underline">
        Volver al inicio
      </Link>
    </div>
  );
}
