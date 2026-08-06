import { Link } from 'react-router-dom';
import { useCart } from '../lib/cart';
import { formatPrice } from '../lib/format';

// Página del carrito: editar cantidades, eliminar líneas y ver el total. El total
// es INFORMATIVO; el vinculante lo fija el servidor al crear el pedido (tarea 03).
export function CartPage() {
  const { items, totalCents, setQuantity, remove } = useCart();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">Tu carrito está vacío</h1>
        <p className="mb-6 text-ink-500">
          Añade productos o lotes del catálogo para tramitar un pedido.
        </p>
        <Link to="/catalogo" className="text-ink-900 underline">
          Ir al catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Tu carrito</h1>

      <ul className="flex flex-col divide-y divide-ink-200 rounded-lg border border-ink-200 bg-white">
        {items.map((item) => (
          <li
            key={`${item.itemType}:${item.itemId}`}
            className="flex items-center gap-4 p-4"
          >
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-ink-100">
              {item.photo ? (
                <img
                  src={item.photo}
                  alt={item.nameSnapshot}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-ink-400">
                  Sin foto
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink-900">
                {item.nameSnapshot}
              </p>
              <p className="text-sm text-ink-500">
                {formatPrice(item.unitPriceCents)} / ud.
              </p>
            </div>

            <label className="flex items-center gap-2">
              <span className="sr-only">Cantidad</span>
              <input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) =>
                  setQuantity(
                    item.itemType,
                    item.itemId,
                    Number(e.target.value),
                  )
                }
                className="w-16 rounded border border-ink-300 px-2 py-1 text-center"
              />
            </label>

            <span className="w-24 text-right font-semibold text-ink-900">
              {formatPrice(item.unitPriceCents * item.quantity)}
            </span>

            <button
              type="button"
              onClick={() => remove(item.itemType, item.itemId)}
              className="text-sm text-ink-400 underline hover:text-red-600"
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-col items-end gap-4">
        <p className="text-lg">
          Total:{' '}
          <span className="font-bold text-ink-900">
            {formatPrice(totalCents)}
          </span>
        </p>
        <p className="text-xs text-ink-400">
          El importe definitivo se calcula en el servidor al tramitar el pedido.
        </p>
        <Link
          to="/checkout"
          className="rounded-md bg-ink-900 px-6 py-3 font-medium text-white hover:bg-ink-800"
        >
          Tramitar pedido
        </Link>
      </div>
    </div>
  );
}
