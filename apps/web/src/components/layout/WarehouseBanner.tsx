import type { ReactNode } from 'react'

export function WarehouseBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span aria-hidden="true">📍</span>
      {children}
    </div>
  )
}
