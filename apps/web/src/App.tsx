import { Outlet } from 'react-router-dom'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { CookieBanner } from './components/CookieBanner'
import { UnderConstructionModal } from './components/UnderConstructionModal'

// Layout público común: cabecera + contenedor donde el router pinta cada página
// (<Outlet/>). Es la base sobre la que cuelgan el inicio, el catálogo, la ficha,
// el carrito, el checkout y la sesión de comprador.
function App() {
  return (
    <div className="flex min-h-screen flex-col bg-ink-50 text-ink-900">
      {/* Salto al contenido: primer elemento enfocable de la página. Está oculto
          hasta que recibe el foco con el tabulador, y evita que quien navega con
          teclado o lector de pantalla tenga que recorrer todo el menú en cada
          página. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Saltar al contenido
      </a>

      <Header />

      <main id="contenido" className="flex-1">
        <Outlet />
      </main>

      <Footer />
      <CookieBanner />
      <UnderConstructionModal />
    </div>
  )
}

export default App
