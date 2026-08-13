import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuctionSocket } from '../lib/useAuctionSocket'
import { useAuth } from '../lib/auth'
import { formatPrice } from '../lib/format'

// Ficha de subasta en vivo (tarea 03). Se apoya por completo en el canal WS: el
// estado inicial y cada puja llegan por Socket.IO, sin polling ni recarga. UI
// mínima, suficiente para verificar que todos ven el precio al instante.
export function AuctionPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const {
    state,
    bids,
    highestBidCents,
    endsAt,
    connected,
    lastRejection,
    closed,
    endingSoon,
    notice,
    myMaxCents,
    isLeading,
    placeBid,
  } = useAuctionSocket(id)

  // Mínimo válido del próximo máximo: precio de salida si no hay pujas, o el
  // precio actual + el incremento. Solo para prefijar el formulario; la verdad la
  // impone el servidor (misma regla que la tarea 02).
  const minNextCents = useMemo(() => {
    if (!state) return 0
    return highestBidCents != null
      ? highestBidCents + state.minIncrementCents
      : state.startingPriceCents
  }, [state, highestBidCents])

  const [amountEuros, setAmountEuros] = useState('')

  if (!state) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-neutral-600">
        {connected ? 'Cargando subasta…' : 'Conectando…'}
      </div>
    )
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const cents = Math.round(parseFloat(amountEuros.replace(',', '.')) * 100)
    if (!Number.isFinite(cents) || cents <= 0) return
    placeBid(cents)
    setAmountEuros('')
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Subasta en vivo</h1>
        <span
          className={`text-xs font-medium ${connected ? 'text-green-600' : 'text-neutral-400'}`}
        >
          {connected ? '● En directo' : '○ Sin conexión'}
        </span>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <p className="text-sm text-neutral-500">Puja actual</p>
        <p className="text-4xl font-bold">
          {formatPrice(highestBidCents ?? state.startingPriceCents)}
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {highestBidCents == null
            ? `Precio de salida · incremento mínimo ${formatPrice(state.minIncrementCents)}`
            : `Incremento mínimo ${formatPrice(state.minIncrementCents)}`}
        </p>
        {endsAt && (
          <p className="mt-1 text-sm text-neutral-500">
            Cierra: {new Date(endsAt).toLocaleString('es-ES')}
          </p>
        )}
      </div>

      {/* Aviso personal (tarea 08): superado o ganado. Llega por la room de usuario. */}
      {notice && (
        <div
          className={`mt-4 rounded-md px-4 py-3 text-sm ${
            notice.kind === 'won'
              ? 'bg-green-50 text-green-800'
              : 'bg-amber-50 text-amber-800'
          }`}
        >
          {notice.kind === 'won'
            ? `¡Has ganado la subasta por ${formatPrice(notice.amountCents)}!${
                notice.secondChance ? ' (segunda oportunidad)' : ''
              } Revisa tu email para pagar.`
            : `Han superado tu máximo: la puja va por ${formatPrice(notice.amountCents)}. Si aún te interesa, indica un máximo mayor.`}
        </div>
      )}

      {/* A punto de cerrar (tarea 08): aviso a la room mientras siga abierta. */}
      {endingSoon && !closed && (
        <div className="mt-4 rounded-md bg-orange-50 px-4 py-3 text-sm text-orange-800">
          La subasta está a punto de cerrar. Si te interesa, puja ya.
        </div>
      )}

      {closed ? (
        <div className="mt-4 rounded-md bg-neutral-100 px-4 py-3 text-sm">
          {state.status === 'CANCELLED'
            ? 'Subasta cancelada.'
            : closed.winnerMasked
              ? `Subasta cerrada. Ganador: ${closed.winnerMasked} · ${formatPrice(closed.amountCents ?? 0)}`
              : 'Subasta cerrada sin pujas (desierta).'}
        </div>
      ) : state.status === 'SCHEDULED' ? (
        <div className="mt-4 rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-800">
          La subasta aún no ha empezado. Abre el{' '}
          {new Date(state.startsAt).toLocaleString('es-ES')}; cuando arranque
          podrás pujar sin recargar.
        </div>
      ) : user ? (
        <div className="mt-4">
          {/* Estado personal: si voy ganando y con qué techo. El máximo es MÍO y
              solo lo ve su dueño; el resto de la sala no sabe que existe. */}
          {myMaxCents != null && (
            <div
              className={`mb-3 rounded-md px-4 py-3 text-sm ${
                isLeading
                  ? 'bg-green-50 text-green-800'
                  : 'bg-neutral-100 text-neutral-700'
              }`}
            >
              {isLeading ? 'Vas ganando. ' : 'Ya no vas ganando. '}
              Tu máximo autorizado es {formatPrice(myMaxCents)}
              {isLeading &&
                ' — solo pujaremos más si alguien te disputa, y nunca por encima de esa cifra.'}
            </div>
          )}

          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              type="number"
              step="0.01"
              min={minNextCents / 100}
              value={amountEuros}
              onChange={(e) => setAmountEuros(e.target.value)}
              placeholder={`Tu máximo (mínimo ${formatPrice(minNextCents)})`}
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2"
            />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-5 py-2 font-semibold text-white hover:bg-neutral-700"
            >
              {myMaxCents != null ? 'Subir mi máximo' : 'Pujar'}
            </button>
          </form>

          {/* Sin esta explicación, quien escribe 100 € y ve que la puja marca 20 €
              cree que ha habido un error. Es la parte menos intuitiva del sistema. */}
          <p className="mt-2 text-xs text-neutral-500">
            Indica el máximo que estás dispuesto a pagar. Pujaremos por ti solo lo
            necesario para ir en cabeza (de {formatPrice(state.minIncrementCents)}{' '}
            en {formatPrice(state.minIncrementCents)}) y subiremos solos si alguien
            te supera, sin pasar nunca de tu máximo. Solo te avisamos si llegan a
            superarlo.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-600">
          Inicia sesión para pujar. Puedes seguir la subasta en directo sin cuenta.
        </p>
      )}

      {lastRejection && (
        <p className="mt-2 text-sm text-red-600">{lastRejection.message}</p>
      )}

      <h2 className="mt-8 mb-3 text-lg font-semibold">Últimas pujas</h2>
      {bids.length === 0 ? (
        <p className="text-sm text-neutral-500">Aún no hay pujas. ¡Sé el primero!</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {bids.map((bid, i) => (
            <li key={i} className="flex justify-between px-4 py-3 text-sm">
              <span className="font-medium">{formatPrice(bid.amountCents)}</span>
              <span className="text-neutral-500">
                {bid.userMasked}
                {/* Explica por qué el precio sube sin que nadie haya escrito nada:
                    es el proxy defendiendo el máximo de alguien. */}
                {bid.isAutomatic && (
                  <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                    automática
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
