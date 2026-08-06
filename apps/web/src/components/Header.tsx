import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useCart } from '../lib/cart';
import { useAuth } from '../lib/auth';
import { LogoWordmark } from './Logo';
import { btnPrimary, container } from '../lib/ui';

const NAV = [
  { to: '/catalogo', label: 'Catálogo' },
  { to: '/subastas', label: 'Subastas' },
  { to: '/subastas/calendario', label: 'Calendario' },
  { to: '/como-funciona', label: 'Cómo funciona' },
];

// Cabecera pública. Dos cambios de fondo respecto a la anterior:
//
// 1. En móvil los enlaces se van a un menú desplegable. Antes se amontonaban
//    todos en una fila y con la sesión iniciada (Mis pedidos, Mi cuenta, Salir)
//    no cabían.
// 2. Se queda pegada arriba al hacer scroll, y solo entonces dibuja borde y
//    sombra. En una web de catálogo el acceso al carrito y al buscador tiene que
//    estar siempre a un clic, sin obligar a subir del todo.
export function Header() {
  const { count } = useCart();
  const { user, ready, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  // Navegar cierra el menú. Sin esto, al pulsar un enlace la página cambia por
  // debajo pero el panel se queda abierto tapándola.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    // passive: le dice al navegador que no vamos a cancelar el evento, así el
    // scroll no espera a que termine nuestro manejador.
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Escape cierra el menú móvil: mismo gesto que ya usa el aviso de obras.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-2 py-1.5 text-sm font-medium transition ${
      isActive
        ? 'text-brand-700'
        : 'text-ink-600 hover:text-ink-900'
    }`;

  return (
    <header
      className={`sticky top-0 z-40 bg-white/90 backdrop-blur transition-shadow duration-200 ${
        scrolled ? 'border-b border-ink-200 shadow-sm' : 'border-b border-transparent'
      }`}
    >
      <div className={`${container} flex items-center justify-between gap-4 py-3`}>
        <Link to="/" className="shrink-0 rounded-md" aria-label="Localiator, ir al inicio">
          <LogoWordmark />
        </Link>

        {/* Navegación de escritorio */}
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass} end>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <CartLink count={count} />

          <div className="hidden items-center gap-1 lg:flex">
            {ready && user ? (
              <>
                <NavLink to="/mis-pedidos" className={linkClass}>
                  Mis pedidos
                </NavLink>
                <NavLink to="/cuenta" className={linkClass}>
                  Mi cuenta
                </NavLink>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-md px-2 py-1.5 text-sm font-medium text-ink-500 transition hover:text-ink-900"
                >
                  Salir
                </button>
              </>
            ) : (
              <Link to="/login" className={`${btnPrimary} ml-2 px-4`}>
                Entrar
              </Link>
            )}
          </div>

          {/* Botón hamburguesa: solo por debajo de lg */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="menu-movil"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            className="flex h-11 w-11 items-center justify-center rounded-md text-ink-700 transition hover:bg-ink-100 lg:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Panel móvil. Se desmonta al cerrar para que sus enlaces no queden
          accesibles con el tabulador estando ocultos. */}
      {open && (
        <div
          id="menu-movil"
          className="animate-[fade-in_0.15s_ease-out] border-t border-ink-200 bg-white lg:hidden"
        >
          <nav className={`${container} flex flex-col py-2`} aria-label="Principal (móvil)">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  `flex min-h-12 items-center rounded-md px-2 text-base font-medium transition ${
                    isActive ? 'text-brand-700' : 'text-ink-700 hover:bg-ink-50'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}

            <hr className="my-2 border-ink-200" />

            {ready && user ? (
              <>
                <NavLink
                  to="/mis-pedidos"
                  className="flex min-h-12 items-center rounded-md px-2 text-base font-medium text-ink-700 hover:bg-ink-50"
                >
                  Mis pedidos
                </NavLink>
                <NavLink
                  to="/cuenta"
                  className="flex min-h-12 items-center rounded-md px-2 text-base font-medium text-ink-700 hover:bg-ink-50"
                >
                  Mi cuenta
                </NavLink>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex min-h-12 items-center rounded-md px-2 text-left text-base font-medium text-ink-500 hover:bg-ink-50"
                >
                  Salir
                </button>
              </>
            ) : (
              <Link to="/login" className={`${btnPrimary} my-2`}>
                Entrar
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function CartLink({ count }: { count: number }) {
  return (
    <Link
      to="/carrito"
      className="relative flex h-11 w-11 items-center justify-center rounded-md text-ink-700 transition hover:bg-ink-100"
      aria-label={count > 0 ? `Carrito, ${count} artículos` : 'Carrito, vacío'}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5.5 w-5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h7.7a1.5 1.5 0 0 0 1.5-1.2L20 8H6" />
        <circle cx="9.5" cy="20" r="1.3" />
        <circle cx="17" cy="20" r="1.3" />
      </svg>
      {count > 0 && (
        <span
          className="absolute right-1 top-1 inline-flex min-w-4.5 items-center justify-center rounded-full bg-accent-600 px-1 text-[0.65rem] font-bold text-white"
          aria-hidden="true"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
