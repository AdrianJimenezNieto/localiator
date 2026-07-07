import { useState } from 'react'
import { Link, NavLink } from 'react-router'
import { SearchBar } from './SearchBar'
import { useCart } from '../../stores/useCart'
import { categories } from '../../mocks/categories'

export function TopBar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const cartCount = useCart((state) => state.items.reduce((sum, line) => sum + line.qty, 0))

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          aria-label="Abrir categorías"
          onClick={() => setMenuOpen(true)}
          className="text-xl md:hidden"
        >
          ☰
        </button>

        <Link to="/" className="mx-auto text-lg font-bold text-neutral-900 md:mx-0">
          Localiator
        </Link>

        <div className="hidden flex-1 md:block">
          <SearchBar />
        </div>

        <Link to="/favoritos" aria-label="Favoritos" className="hidden text-xl md:block">
          ♡
        </Link>
        <Link to="/cuenta" aria-label="Cuenta" className="hidden text-xl md:block">
          👤
        </Link>
        <Link to="/favoritos" aria-label="Favoritos" className="text-xl md:hidden">
          ♡
        </Link>
        <Link to="/carrito" aria-label="Carrito" className="relative text-xl">
          🛒
          {cartCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-neutral-900">
              {cartCount}
            </span>
          )}
        </Link>
      </div>

      <nav className="hidden gap-4 border-t border-neutral-100 px-4 py-2 md:flex">
        {categories.map((category) => (
          <NavLink
            key={category.slug}
            to={`/categoria/${category.slug}`}
            className={({ isActive }) =>
              `text-sm ${isActive ? 'font-semibold text-amber-600' : 'text-neutral-600'}`
            }
          >
            {category.name}
          </NavLink>
        ))}
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-30 flex flex-col bg-white p-4 md:hidden">
          <button
            type="button"
            aria-label="Cerrar categorías"
            onClick={() => setMenuOpen(false)}
            className="self-end text-xl"
          >
            ✕
          </button>
          <nav className="mt-4 flex flex-col gap-3">
            {categories.map((category) => (
              <Link
                key={category.slug}
                to={`/categoria/${category.slug}`}
                onClick={() => setMenuOpen(false)}
                className="text-base text-neutral-800"
              >
                {category.name}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}
