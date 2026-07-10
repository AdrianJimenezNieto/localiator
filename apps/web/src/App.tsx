import { Link, Outlet } from 'react-router-dom'
import { useCart } from './lib/cart'

// Layout público común: cabecera + contenedor donde el router pinta cada página
// (<Outlet/>). Es la base sobre la que cuelgan el catálogo, la ficha, el carrito
// y (más adelante) el backoffice.
function App() {
  const { count } = useCart()

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-xl font-bold">
            Localiator
          </Link>

          <Link
            to="/carrito"
            className="relative flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900"
          >
            Carrito
            {count > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1.5 text-xs font-semibold text-white">
                {count}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  )
}

export default App
