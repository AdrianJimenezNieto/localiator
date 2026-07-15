import { Link } from 'react-router-dom';
import { AuctionStatus, type AuctionListItem } from '@localiator/shared';
import { formatPrice } from '../lib/format';
import { useCountdown } from '../lib/useCountdown';

// Tarjeta del listado de subastas. No reutiliza ProductCard a propósito: aquella
// pinta precio con descuento, estado del artículo y enlaza a la ficha del catálogo;
// una subasta necesita estado, precio actual, cuenta atrás y número de pujas.
// Forzar una sola tarjeta la llenaría de condicionales para dos casos que no se
// parecen tanto.
export function AuctionCard({ auction }: { auction: AuctionListItem }) {
  const live = auction.status === AuctionStatus.LIVE;
  // En una programada la cuenta atrás relevante es hasta que ABRE, no hasta que
  // cierra: es el dato que le importa a quien la está esperando.
  const target = live ? auction.endsAt : auction.startsAt;
  const remaining = useCountdown(target);

  return (
    <Link
      to={`/subastas/${auction.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
    >
      <div className="aspect-square w-full overflow-hidden bg-neutral-100">
        {auction.photo ? (
          <img
            src={auction.photo}
            alt={auction.name}
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
        <AuctionStatusBadge status={auction.status} />
        <h3 className="line-clamp-2 font-medium text-neutral-900">
          {auction.name}
        </h3>

        <div className="mt-auto pt-1">
          <p className="text-xs text-neutral-500">
            {auction.bidCount === 0
              ? 'Precio de salida'
              : `Puja actual · ${auction.bidCount} ${
                  auction.bidCount === 1 ? 'puja' : 'pujas'
                }`}
          </p>
          <p className="font-semibold text-neutral-900">
            {formatPrice(auction.currentPriceCents)}
          </p>
          {remaining && (
            <p
              className={`text-xs ${
                live && remaining.urgent
                  ? 'font-medium text-orange-600'
                  : 'text-neutral-500'
              }`}
            >
              {live ? `Cierra en ${remaining.label}` : `Abre en ${remaining.label}`}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function AuctionStatusBadge({ status }: { status: AuctionStatus }) {
  if (status === AuctionStatus.LIVE) {
    return (
      <span className="w-fit rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
        ● En directo
      </span>
    );
  }
  if (status === AuctionStatus.SCHEDULED) {
    return (
      <span className="w-fit rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
        Programada
      </span>
    );
  }
  return (
    <span className="w-fit rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
      Cerrada
    </span>
  );
}
