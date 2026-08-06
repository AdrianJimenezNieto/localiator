import { Link } from 'react-router-dom';
import { itemPath, type CatalogItem } from '@localiator/shared';
import { finalPriceCents, formatPrice } from '../lib/format';
import { cardInteractive } from '../lib/ui';

export function ProductCard({ item }: { item: CatalogItem }) {
  const hasDiscount = item.discountCents > 0;
  const finalCents = finalPriceCents(item.priceCents, item.discountCents);
  // Porcentaje de descuento redondeado. Se enseña el % y no solo el precio
  // tachado porque "-40%" se capta de un vistazo en una rejilla; comparar dos
  // cifras exige pararse a restar.
  const discountPct = hasDiscount
    ? Math.round((item.discountCents / item.priceCents) * 100)
    : 0;

  return (
    <Link
      to={itemPath(item.kind, item.id, item.name)}
      className={`group flex h-full flex-col overflow-hidden ${cardInteractive}`}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-ink-100">
        {item.photo ? (
          <img
            src={item.photo}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-ink-400">
            Sin foto
          </div>
        )}

        {discountPct > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-accent-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
            −{discountPct}%
          </span>
        )}

        {/* Los lotes se marcan porque no es lo mismo comprar un artículo que una
            caja entera, y en la rejilla ambos ocupan la misma tarjeta. */}
        {item.kind === 'lot' && (
          <span className="absolute right-2 top-2 rounded-full bg-ink-900/85 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            Lote
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="line-clamp-2 font-medium leading-snug text-ink-900 transition group-hover:text-brand-700">
          {item.name}
        </h3>

        <div className="mt-auto flex items-baseline gap-2 pt-2">
          <span className="font-heading text-lg font-bold text-ink-900">
            {formatPrice(finalCents)}
          </span>
          {hasDiscount && (
            <span className="text-sm text-ink-400 line-through">
              {formatPrice(item.priceCents)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
