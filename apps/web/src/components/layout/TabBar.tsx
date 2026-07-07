import { NavLink } from 'react-router'

const tabs = [
  { to: '/', label: 'Inicio', icon: '🏠' },
  { to: '/buscar', label: 'Buscar', icon: '🔍' },
  { to: '/favoritos', label: 'Favoritos', icon: '♡' },
  { to: '/cuenta', label: 'Cuenta', icon: '👤' },
]

export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-neutral-200 bg-white md:hidden">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              isActive ? 'text-amber-600' : 'text-neutral-500'
            }`
          }
        >
          <span className="text-lg" aria-hidden="true">
            {tab.icon}
          </span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
