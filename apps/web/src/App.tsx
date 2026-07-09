import { Link, Outlet } from 'react-router-dom'

// Layout público común: cabecera + contenedor donde el router pinta cada página
// (<Outlet/>). Es la base sobre la que cuelgan el catálogo, la ficha y (más
// adelante) el backoffice.
function App() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-4">
          <Link to="/" className="text-xl font-bold">
            Localiator
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
