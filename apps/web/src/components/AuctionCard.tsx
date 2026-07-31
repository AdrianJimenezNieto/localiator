import { Link } from 'react-router-dom';
import type { AuctionListItem } from '@localiator/shared';
import { AUCTION_STATUS_LABELS } from '../lib/auctions';
import { formatPrice } from '../lib/format';

export function AuctionCard({ auction }: { auction: AuctionListItem }) {
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
        <span className="w-fit rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
          {AUCTION_STATUS_LABELS[auction.status]}
        </span>
        <h3 className="line-clamp-2 font-medium text-neutral-900">{auction.name}</h3>

        <div className="mt-auto pt-1">
          <p className="text-sm text-neutral-500">
            {auction.bidCount > 0 ? 'Puja actual' : 'Precio de salida'}
          </p>
          <p className="font-semibold text-neutral-900">
            {formatPrice(auction.currentPriceCents)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {auction.status === 'SCHEDULED' ? 'Empieza' : 'Cierra'}:{' '}
            {new Date(
              auction.status === 'SCHEDULED' ? auction.startsAt : auction.endsAt,
            ).toLocaleString('es-ES')}
          </p>
        </div>
      </div>
    </Link>
  );
}
