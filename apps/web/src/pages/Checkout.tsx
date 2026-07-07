import { useState } from 'react'
import { useNavigate } from 'react-router'
import { WarehousePicker } from '../components/purchase/WarehousePicker'
import { PickupSlotPicker } from '../components/purchase/PickupSlotPicker'
import { OrderSummary } from '../components/purchase/OrderSummary'
import { Button } from '../components/ui/Button'
import { useAuth } from '../stores/useAuth'
import { usePickup } from '../stores/usePickup'
import { useCart } from '../stores/useCart'
import type { Order } from '../types/domain'

type Step = 1 | 2 | 3

function generatePickupCode(): string {
  return `LC-${Math.floor(1000 + Math.random() * 9000)}`
}

export function Checkout() {
  const navigate = useNavigate()
  const { user, isGuest, continueAsGuest } = useAuth()
  const { warehouse, slot, setWarehouse, setSlot } = usePickup()
  const cartItems = useCart((state) => state.items)
  const coupon = useCart((state) => state.appliedCoupon)

  const [step, setStep] = useState<Step>(1)
  const [email, setEmail] = useState(user?.email ?? '')

  const identificationDone = isGuest ? email.trim().length > 0 : Boolean(user)
  const pickupDone = Boolean(warehouse && slot)

  function handleConfirm() {
    if (!warehouse || !slot) return
    const order: Order = {
      id: crypto.randomUUID(),
      items: cartItems,
      coupon,
      pickup: { warehouse, slot },
      code: generatePickupCode(),
      status: 'pending',
    }
    navigate(`/pedido/${order.id}`, { state: order })
  }

  return (
    <div className="flex flex-col gap-6 md:grid md:grid-cols-[1fr_320px] md:items-start md:gap-8">
      <div className="flex flex-col gap-3">
        <section className="rounded-lg border border-neutral-200 p-4">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="flex w-full items-center justify-between font-medium text-neutral-900"
          >
            1 · Identificación {identificationDone && <span className="text-green-600">✓</span>}
          </button>
          {step === 1 && (
            <div className="mt-3 flex flex-col gap-2">
              {!isGuest && !user && (
                <Button variant="secondary" onClick={continueAsGuest}>
                  Continuar como invitado
                </Button>
              )}
              <label htmlFor="checkout-email" className="text-sm text-neutral-600">
                Email para avisos de recogida
              </label>
              <input
                id="checkout-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <Button disabled={!identificationDone} onClick={() => setStep(2)}>
                Continuar
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-neutral-200 p-4">
          <button
            type="button"
            onClick={() => identificationDone && setStep(2)}
            disabled={!identificationDone}
            className="flex w-full items-center justify-between font-medium text-neutral-900 disabled:opacity-40"
          >
            2 · Recogida {pickupDone && <span className="text-green-600">✓</span>}
          </button>
          {step === 2 && (
            <div className="mt-3 flex flex-col gap-4">
              <WarehousePicker value={warehouse} onChange={setWarehouse} />
              {warehouse && <PickupSlotPicker value={slot} onChange={setSlot} />}
              <Button disabled={!pickupDone} onClick={() => setStep(3)}>
                Continuar
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-neutral-200 p-4">
          <button
            type="button"
            onClick={() => pickupDone && setStep(3)}
            disabled={!pickupDone}
            className="flex w-full items-center justify-between font-medium text-neutral-900 disabled:opacity-40"
          >
            3 · Pago
          </button>
          {step === 3 && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-sm text-neutral-500">Tarjeta · PayPal · Bizum (mock, Stripe llega en Fase 4)</p>
              <input
                placeholder="Número de tarjeta"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <Button onClick={handleConfirm}>Confirmar y pagar</Button>
            </div>
          )}
        </section>
      </div>

      <div className="md:sticky md:top-20">
        <OrderSummary />
      </div>
    </div>
  )
}
