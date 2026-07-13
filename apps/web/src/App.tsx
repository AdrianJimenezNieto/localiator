import { Link, Outlet } from 'react-router-dom'
import { useCart } from './lib/cart'
import { useAuth } from './lib/auth'
import { Footer } from './components/Footer'
import { CookieBanner } from './components/CookieBanner'

// Layout público común: cabecera + contenedor donde el router pinta cada página
// (<Outlet/>). Es la base sobre la que cuelgan el catálogo, la ficha, el carrito,
// el checkout y la sesión de comprador.
function App() {
  const { count } = useCart()
  const { user, ready, logout } = useAuth()

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-xl font-bold">
            Localiator
          </Link>

          <nav className="flex items-center gap-5 text-sm font-medium text-neutral-700">
            <Link
              to="/carrito"
              className="relative flex items-center gap-2 hover:text-neutral-900"
            >
              Carrito
              {count > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1.5 text-xs font-semibold text-white">
                  {count}
                </span>
              )}
            </Link>

            {ready && user ? (
              <>
                <Link to="/mis-pedidos" className="hover:text-neutral-900">
                  Mis pedidos
                </Link>
                <Link to="/cuenta" className="hover:text-neutral-900">
                  Mi cuenta
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="text-neutral-500 hover:text-neutral-900"
                >
                  Salir
                </button>
              </>
            ) : (
              <Link to="/login" className="hover:text-neutral-900">
                Entrar
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <Footer />
      <CookieBanner />
    </div>
  )
}

export default App
