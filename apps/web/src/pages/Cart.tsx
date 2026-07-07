import { Link, useNavigate } from 'react-router'
import { WarehouseBanner } from '../components/layout/WarehouseBanner'
import { CartLine } from '../components/purchase/CartLine'
import { CouponInput } from '../components/purchase/CouponInput'
import { OrderSummary } from '../components/purchase/OrderSummary'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { useCart } from '../stores/useCart'
import { getItemById } from '../mocks/items'

export function Cart() {
  const cartItems = useCart((state) => state.items)
  const navigate = useNavigate()

  if (cartItems.length === 0) {
    return (
      <EmptyState
        title="Tu carrito está vacío"
        action={
          <Link to="/" className="text-amber-600 underline">
            Seguir comprando
          </Link>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <WarehouseBanner>Recogida en almacén, sin coste de envío.</WarehouseBanner>

      <div className="flex flex-col">
        {cartItems.map((line) => {
          const item = getItemById(line.itemId)
          return item ? <CartLine key={line.itemId} item={item} qty={line.qty} /> : null
        })}
      </div>

      <CouponInput />
      <OrderSummary />

      <Button onClick={() => navigate('/checkout')}>Tramitar recogida →</Button>
    </div>
  )
}
