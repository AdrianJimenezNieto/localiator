import { Link, useLocation, useParams } from 'react-router'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import type { Order } from '../types/domain'

export function OrderConfirmation() {
  const { id } = useParams()
  const location = useLocation()
  const order = location.state as Order | null

  if (!order || order.id !== id) {
    return (
      <EmptyState
        title="No encontramos los datos de este pedido"
        action={
          <Link to="/cuenta/pedidos" className="text-amber-600 underline">
            Ver mis pedidos
          </Link>
        }
      />
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="text-4xl" aria-hidden="true">
        ✅
      </span>
      <h1 className="text-xl font-semibold text-neutral-900">¡Pedido confirmado!</h1>
      <p className="text-neutral-600">Te avisaremos por email cuando esté listo para recoger.</p>

      <div className="flex w-full max-w-sm flex-col gap-2 rounded-lg border border-neutral-200 p-4 text-left text-sm">
        <p>
          📍 <strong>{order.pickup.warehouse.name}</strong> — {order.pickup.warehouse.address}
        </p>
        <p>
          🗓 {order.pickup.slot.date} · {order.pickup.slot.window === 'AM' ? 'Mañana' : 'Tarde'}
        </p>
        <p className="text-base">
          🔖 Código de recogida: <strong>{order.code}</strong>
        </p>
        <div className="flex h-32 items-center justify-center rounded-md bg-neutral-100 text-neutral-400">
          QR
        </div>
      </div>

      <div className="flex gap-3">
        <Link to={`/cuenta/pedidos`}>
          <Button variant="secondary">Ver pedido</Button>
        </Link>
        <Link to="/">
          <Button>Seguir comprando</Button>
        </Link>
      </div>
    </div>
  )
}
