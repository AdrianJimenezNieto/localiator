import { useState } from 'react'
import { Link } from 'react-router'
import { WarehousePicker } from '../../components/purchase/WarehousePicker'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../stores/useAuth'
import { usePickup } from '../../stores/usePickup'

export function Account() {
  const { user, isGuest, logout } = useAuth()
  const { warehouse, setWarehouse } = usePickup()
  const [editingWarehouse, setEditingWarehouse] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-200 text-lg">
          {user?.name.charAt(0).toUpperCase() ?? '?'}
        </span>
        <div>
          <p className="font-medium text-neutral-900">{user?.name ?? (isGuest ? 'Invitado' : 'Sin sesión')}</p>
          <p className="text-sm text-neutral-500">{user?.email ?? '—'}</p>
        </div>
      </div>

      <nav className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        <Link to="/cuenta/pedidos" className="px-4 py-3 text-sm">
          📦 Mis pedidos y recogidas
        </Link>
        <Link to="/cuenta/favoritos" className="px-4 py-3 text-sm">
          ♡ Favoritos
        </Link>
        <Link to="/cuenta/cupones" className="px-4 py-3 text-sm">
          🏷 Mis cupones
        </Link>
        <button
          type="button"
          onClick={() => setEditingWarehouse((open) => !open)}
          className="px-4 py-3 text-left text-sm"
        >
          📍 Almacén preferido{warehouse ? ` — ${warehouse.name}` : ''}
        </button>
        {editingWarehouse && (
          <div className="px-4 py-3">
            <WarehousePicker value={warehouse} onChange={setWarehouse} />
          </div>
        )}
        <Link to="/cuenta/datos" className="px-4 py-3 text-sm">
          👤 Datos personales
        </Link>
      </nav>

      {(user || isGuest) && (
        <Button variant="ghost" onClick={logout}>
          Cerrar sesión
        </Button>
      )}
    </div>
  )
}
