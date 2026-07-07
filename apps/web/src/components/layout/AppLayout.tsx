import { Outlet } from 'react-router'
import { TopBar } from './TopBar'
import { TabBar } from './TabBar'

export function AppLayout() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <TopBar />
      <main className="mx-auto max-w-5xl px-4 py-4 pb-20 md:pb-8">
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}
