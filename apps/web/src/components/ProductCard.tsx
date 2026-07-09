import { Link } from 'react-router-dom';
import type { CatalogItem } from '@localiator/shared';
import { conditionLabel, finalPriceCents, formatPrice } from '../lib/format';

// Ruta de la ficha según el tipo (producto o lote). La define la tarea 11; aquí ya
// enlazamos para no rehacer las tarjetas después.
function detailPath(item: CatalogItem): string {
  return item.kind === 'lot' ? `/lotes/${item.id}` : `/productos/${item.id}`;
}

export function ProductCard({ item }: { item: CatalogItem }) {
  const hasDiscount = item.discountCents > 0;
  const finalCents = finalPriceCents(item.priceCents, item.discountCents);

  return (
    <Link
      to={detailPath(item)}
      className="group flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
    >
      <div className="aspect-square w-full overflow-hidden bg-neutral-100">
        {item.photo ? (
          <img
            src={item.photo}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-400">
            Sin foto
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="w-fit rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
          {conditionLabel(item.condition)}
        </span>
        <h3 className="line-clamp-2 font-medium text-neutral-900">{item.name}</h3>

        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="font-semibold text-neutral-900">
            {formatPrice(finalCents)}
          </span>
          {hasDiscount && (
            <span className="text-sm text-neutral-400 line-through">
              {formatPrice(item.priceCents)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
