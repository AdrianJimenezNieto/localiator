import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AuctionListItem } from '@localiator/shared';
import { toQuery } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useSeo } from '../lib/useSeo';
import {
  type VisibleMonth,
  currentMonth,
  dayKey,
  dayLabel,
  formatMonthParam,
  formatTime,
  isDayKey,
  monthGrid,
  monthOfDay,
  monthRange,
  parseMonthParam,
  shiftMonth,
  todayKey,
} from '../lib/calendar';
import { AuctionCard } from '../components/AuctionCard';
import { AuctionCalendarGrid } from '../components/AuctionCalendarGrid';

// Calendario público de subastas: rejilla mensual por fecha de CIERRE, con el
// detalle del día seleccionado debajo.
//
// El estado (mes visible y día seleccionado) vive en la URL, no en useState, por
// tres motivos: `useApi` se re-ejecuta solo al cambiar el path (así navegar de mes
// recarga los datos sin código extra), el enlace de un día concreto se puede
// compartir, y el botón "atrás" del navegador funciona como se espera.
export function AuctionsCalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  useSeo({
    title: 'Calendario de subastas — Localiator',
    description:
      'Qué subastas cierran cada día: consulta el calendario de subastas de Localiator.',
    canonicalPath: '/subastas/calendario',
  });

  const monthParam = searchParams.get('mes');
  const dayParam = searchParams.get('dia');

  // El mes sale de `?mes=`; si no está pero sí `?dia=`, se abre el mes de ese día
  // (para que un enlace compartido a un día concreto muestre su mes).
  const visible: VisibleMonth = monthParam
    ? parseMonthParam(monthParam)
    : isDayKey(dayParam)
      ? monthOfDay(dayParam)
      : currentMonth();

  const range = monthRange(visible);
  const { data, error, loading } = useApi<AuctionListItem[]>(
    `/auctions/calendar${toQuery(range)}`,
  );

  // Agrupación por día natural español. Es `dayKey` y no un slice del ISO: ver el
  // comentario largo en lib/calendar.ts, agrupar por el día UTC mete las subastas
  // de madrugada en el día anterior media parte del año.
  const byDay = useMemo(() => {
    const map = new Map<string, AuctionListItem[]>();
    for (const auction of data ?? []) {
      const key = dayKey(auction.endsAt);
      const bucket = map.get(key);
      if (bucket) bucket.push(auction);
      else map.set(key, [auction]);
    }
    return map;
  }, [data]);

  // Día seleccionado. Si la URL no trae `?dia=`, se elige uno por defecto en vez
  // de dejar el panel vacío (entrar y no ver nada parece que la página falla):
  // hoy si tiene subastas, y si no el primer día de la rejilla que tenga alguna.
  //
  // Se depende de `year`/`month` sueltos y no del objeto `visible`: es literal
  // nuevo en cada render, así que como dependencia invalidaría el memo siempre.
  const { year, month } = visible;
  const selectedDay = useMemo(() => {
    if (isDayKey(dayParam)) return dayParam;
    const today = todayKey();
    if (byDay.has(today)) return today;
    return monthGrid({ year, month }).find((d) => byDay.has(d.key))?.key ?? null;
  }, [dayParam, byDay, year, month]);

  const selectedAuctions = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  function goToMonth(next: VisibleMonth) {
    // Al cambiar de mes se suelta el día seleccionado: casi nunca sigue estando en
    // la rejilla, y arrastrarlo dejaría un panel de otro mes bajo el calendario.
    setSearchParams({ mes: formatMonthParam(next) });
  }

  function selectDay(key: string) {
    setSearchParams({ mes: formatMonthParam(visible), dia: key });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">
          Calendario de subastas
        </h1>
        <Link
          to="/subastas"
          className="rounded-md bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-200"
        >
          Ver como lista
        </Link>
      </div>

      <p className="mb-6 text-sm text-ink-500">
        Cada subasta aparece en el día en que <strong>cierra</strong> (hora
        peninsular española).
      </p>

      {error && (
        <p className="mb-6 rounded-md bg-red-50 p-4 text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className={loading ? 'animate-pulse opacity-60' : undefined}>
        <AuctionCalendarGrid
          visible={visible}
          byDay={byDay}
          selectedDay={selectedDay}
          onSelectDay={selectDay}
          onShiftMonth={(delta) => goToMonth(shiftMonth(visible, delta))}
          onToday={() => goToMonth(currentMonth())}
        />
      </div>

      {/* aria-live: al pulsar un día, el cambio de panel se anuncia. Sin esto,
          para un lector de pantalla pulsar una celda no produce ningún efecto
          perceptible. */}
      <section className="mt-8" aria-live="polite">
        {!loading && !error && selectedDay === null && (
          <p className="py-12 text-center text-ink-500">
            No hay subastas que cierren este mes.
          </p>
        )}

        {selectedDay !== null && (
          <>
            <h2 className="mb-4 text-lg font-semibold text-ink-900">
              {dayLabel(selectedDay)}
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {selectedAuctions.map((auction) => (
                <div key={auction.id}>
                  <AuctionCard auction={auction} />
                  <p className="mt-1 text-center text-xs text-ink-500">
                    Cierra a las {formatTime(auction.endsAt)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
