import { Outlet, useLocation } from 'react-router'
import { TopBar } from './TopBar'
import { TabBar } from './TabBar'

// El detalle de producto usa StickyBuyBar como CTA fijo abajo en móvil;
// mostrar el TabBar a la vez lo tapa y sus enlaces roban los clics.
const HIDES_TAB_BAR = [/^\/producto\//]

export function AppLayout() {
  const location = useLocation()
  const showTabBar = !HIDES_TAB_BAR.some((pattern) => pattern.test(location.pathname))

  return (
    <div className="min-h-screen bg-neutral-50">
      <TopBar />
      <main className={`mx-auto max-w-5xl px-4 py-4 ${showTabBar ? 'pb-20 md:pb-8' : 'pb-24 md:pb-8'}`}>
        <Outlet />
      </main>
      {showTabBar && <TabBar />}
    </div>
  )
}
