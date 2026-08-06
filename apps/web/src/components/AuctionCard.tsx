import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuctionListItem } from '@localiator/shared';
import { AUCTION_STATUS_LABELS } from '../lib/auctions';
import { formatPrice } from '../lib/format';
import { badge, cardInteractive } from '../lib/ui';

export function AuctionCard({ auction }: { auction: AuctionListItem }) {
  const isLive = auction.status === 'LIVE';
  const isScheduled = auction.status === 'SCHEDULED';
  const deadline = isScheduled ? auction.startsAt : auction.endsAt;

  return (
    <Link
      to={`/subastas/${auction.id}`}
      className={`group flex h-full flex-col overflow-hidden ${cardInteractive}`}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-ink-100">
        {auction.photo ? (
          <img
            src={auction.photo}
            alt={auction.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-ink-400">
            Sin foto
          </div>
        )}

        <span
          className={`absolute left-2 top-2 ${
            isLive ? badge('accent') : badge('neutral')
          } shadow-sm`}
        >
          {/* El punto que late solo aparece en las subastas en curso: es lo que
              distingue "esto está pasando ahora" de una simplemente programada. */}
          {isLive && (
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-accent-500" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-600" />
            </span>
          )}
          {AUCTION_STATUS_LABELS[auction.status]}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="line-clamp-2 font-medium leading-snug text-ink-900 transition group-hover:text-brand-700">
          {auction.name}
        </h3>

        <div className="mt-auto pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {auction.bidCount > 0 ? 'Puja actual' : 'Precio de salida'}
          </p>
          <p className="font-heading text-xl font-bold text-ink-900">
            {formatPrice(auction.currentPriceCents)}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            {auction.bidCount === 1
              ? '1 puja'
              : `${auction.bidCount} pujas`}
          </p>

          <Countdown
            deadline={deadline}
            label={isScheduled ? 'Empieza en' : 'Cierra en'}
            live={isLive}
            fallbackStatus={auction.status}
          />
        </div>
      </div>
    </Link>
  );
}

// Cuenta atrás. En una subasta el tiempo que queda es el dato que decide si
// entras ahora o lo dejas para luego, y una fecha absoluta ("6/8/2026, 18:30")
// obliga a calcularlo mentalmente. Se muestran las dos: la cuenta atrás manda y
// la fecha queda como referencia.
function Countdown({
  deadline,
  label,
  live,
  fallbackStatus,
}: {
  deadline: string;
  label: string;
  live: boolean;
  fallbackStatus: string;
}) {
  const target = new Date(deadline).getTime();
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    // Solo tictaquea si queda menos de un día. Por encima de eso el minuto no
    // aporta nada y sería un intervalo corriendo en balde en cada tarjeta.
    if (target - Date.now() > 24 * 60 * 60 * 1000) return;

    const id = setInterval(() => setRemaining(target - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  // Cerradas, pagadas o canceladas: no hay nada que contar.
  if (fallbackStatus === 'CLOSED' || fallbackStatus === 'PAID' || fallbackStatus === 'CANCELLED') {
    return (
      <p className="mt-2 text-xs text-ink-500">
        Finalizó el {new Date(deadline).toLocaleDateString('es-ES')}
      </p>
    );
  }

  if (remaining <= 0) {
    return <p className="mt-2 text-xs font-medium text-ink-600">Cerrando…</p>;
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const text =
    days > 0
      ? `${days} d ${hours} h`
      : hours > 0
        ? `${hours} h ${minutes} min`
        : `${minutes}:${String(seconds).padStart(2, '0')}`;

  // Menos de una hora en una subasta viva: se pinta en naranja para que destaque
  // sobre el resto de la tarjeta.
  const urgent = live && remaining < 60 * 60 * 1000;

  return (
    <p
      className={`mt-2 text-xs font-semibold ${urgent ? 'text-accent-700' : 'text-ink-600'}`}
    >
      {label}{' '}
      <time dateTime={deadline}>{text}</time>
    </p>
  );
}
