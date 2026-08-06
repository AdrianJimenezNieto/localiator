import { Link } from 'react-router-dom'
import { COMPANY } from '../lib/legal'
import { Logo } from './Logo'
import { container } from '../lib/ui'

// Pie común a toda la web. Además de los enlaces legales obligatorios (aviso
// legal, condiciones, privacidad y cookies), ahora repite la navegación
// principal: quien llega al final de una página larga tiene ahí a dónde ir sin
// volver a subir.
export function Footer() {
  return (
    <footer className="mt-20 border-t border-ink-200 bg-white">
      <div className={`${container} py-12`}>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Logo className="h-10 w-auto" title={null} />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-600">
              Lotes y productos individuales procedentes de subastas, a precio de
              saldo y con recogida en almacén.
            </p>
          </div>

          <FooterColumn title="Comprar">
            <FooterLink to="/catalogo">Catálogo</FooterLink>
            <FooterLink to="/subastas">Subastas</FooterLink>
            <FooterLink to="/subastas/calendario">Calendario</FooterLink>
          </FooterColumn>

          <FooterColumn title="Ayuda">
            <FooterLink to="/como-funciona">Cómo funciona</FooterLink>
            <FooterLink to="/mis-pedidos">Mis pedidos</FooterLink>
            <FooterLink to="/cuenta">Mi cuenta</FooterLink>
          </FooterColumn>

          <FooterColumn title="Legal">
            <FooterLink to="/aviso-legal">Aviso legal</FooterLink>
            <FooterLink to="/condiciones-venta">Condiciones de venta</FooterLink>
            <FooterLink to="/privacidad">Privacidad</FooterLink>
            <FooterLink to="/cookies">Cookies</FooterLink>
          </FooterColumn>
        </div>

        <div className="mt-10 border-t border-ink-200 pt-6 text-sm text-ink-500">
          <p>
            © {new Date().getFullYear()} {COMPANY.brand}
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-ink-900">{title}</h2>
      <ul className="space-y-2">{children}</ul>
    </div>
  )
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className="text-sm text-ink-600 transition hover:text-brand-700"
      >
        {children}
      </Link>
    </li>
  )
}
