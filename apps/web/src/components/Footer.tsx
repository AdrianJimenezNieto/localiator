import { Link } from 'react-router-dom'
import { COMPANY } from '../lib/legal'

// Footer común a toda la web con los enlaces legales exigidos (aviso legal,
// condiciones, privacidad y cookies). Debe ser visible en todas las páginas, por
// eso se monta en el layout raíz (App.tsx). Algunas rutas (privacidad, cookies)
// se crean en tareas posteriores de la Fase 4.
export function Footer() {
  return (
    <footer className="mt-16 border-t border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {COMPANY.brand}
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/aviso-legal" className="hover:text-neutral-900">
            Aviso legal
          </Link>
          <Link to="/condiciones-venta" className="hover:text-neutral-900">
            Condiciones de venta
          </Link>
          <Link to="/privacidad" className="hover:text-neutral-900">
            Privacidad
          </Link>
          <Link to="/cookies" className="hover:text-neutral-900">
            Cookies
          </Link>
        </nav>
      </div>
    </footer>
  )
}
