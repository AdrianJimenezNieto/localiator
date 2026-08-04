import type { AuctionListItem } from '@localiator/shared';
import {
  WEEKDAY_LABELS,
  type VisibleMonth,
  monthGrid,
  monthLabel,
  todayKey,
} from '../lib/calendar';

interface Props {
  visible: VisibleMonth;
  // Subastas del mes ya agrupadas por día (clave YYYY-MM-DD en hora española).
  byDay: Map<string, AuctionListItem[]>;
  selectedDay: string | null;
  onSelectDay: (key: string) => void;
  onShiftMonth: (delta: number) => void;
  onToday: () => void;
}

// Rejilla mensual, PRESENTACIONAL: no hace fetching ni conoce la URL. Recibe las
// subastas ya agrupadas y avisa hacia arriba de la navegación. Así se puede
// probar y reutilizar sin montar la página entera.
export function AuctionCalendarGrid({
  visible,
  byDay,
  selectedDay,
  onSelectDay,
  onShiftMonth,
  onToday,
}: Props) {
  const days = monthGrid(visible);
  const today = todayKey();

  return (
    <section aria-label="Calendario de subastas">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onShiftMonth(-1)}
            aria-label="Mes anterior"
            className="rounded-md px-2 py-1 text-lg text-neutral-600 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            ‹
          </button>
          {/* aria-live: al cambiar de mes con los botones, el lector de pantalla
              anuncia el mes nuevo. Sin esto la navegación es muda. */}
          <h2
            className="min-w-40 text-center font-semibold text-neutral-900"
            aria-live="polite"
          >
            {monthLabel(visible)}
          </h2>
          <button
            type="button"
            onClick={() => onShiftMonth(1)}
            aria-label="Mes siguiente"
            className="rounded-md px-2 py-1 text-lg text-neutral-600 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={onToday}
          className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        >
          Hoy
        </button>
      </header>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map((label, i) => (
          // Las iniciales se repiten (M de martes y de miércoles), así que la
          // clave es el índice, no la etiqueta.
          <div key={i} className="pb-1 text-xs font-medium text-neutral-400">
            {label}
          </div>
        ))}

        {days.map((day) => {
          const auctions = byDay.get(day.key) ?? [];
          return (
            <DayCell
              key={day.key}
              dayOfMonth={day.dayOfMonth}
              dayKey={day.key}
              inMonth={day.inMonth}
              count={auctions.length}
              isToday={day.key === today}
              isSelected={day.key === selectedDay}
              onSelect={onSelectDay}
            />
          );
        })}
      </div>
    </section>
  );
}

interface DayCellProps {
  dayOfMonth: number;
  dayKey: string;
  inMonth: boolean;
  count: number;
  isToday: boolean;
  isSelected: boolean;
  onSelect: (key: string) => void;
}

function DayCell({
  dayOfMonth,
  dayKey,
  inMonth,
  count,
  isToday,
  isSelected,
  onSelect,
}: DayCellProps) {
  // Los días sin subastas no son pulsables: un botón que no hace nada al pulsarlo
  // es peor que un hueco, y con teclado obligaría a tabular por 42 celdas muertas.
  if (count === 0) {
    return (
      <div
        className={`aspect-square rounded-md p-1 text-sm sm:aspect-auto sm:min-h-16 ${
          inMonth ? 'text-neutral-500' : 'text-neutral-300'
        } ${isToday ? 'ring-1 ring-neutral-900' : ''}`}
      >
        {dayOfMonth}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(dayKey)}
      aria-pressed={isSelected}
      // El número suelto y el punto de color no dicen nada a un lector de
      // pantalla: la etiqueta lleva el día y cuántas subastas cierran.
      aria-label={`${dayOfMonth}: ${count} ${count === 1 ? 'subasta' : 'subastas'}`}
      className={`flex aspect-square flex-col items-center justify-start gap-1 rounded-md p-1 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 sm:aspect-auto sm:min-h-16 ${
        isSelected
          ? 'bg-neutral-900 text-white'
          : `${inMonth ? 'text-neutral-900' : 'text-neutral-400'} bg-neutral-100 hover:bg-neutral-200`
      } ${isToday && !isSelected ? 'ring-1 ring-neutral-900' : ''}`}
    >
      <span className="font-medium">{dayOfMonth}</span>
      {/* aria-hidden: el conteo ya va en el aria-label del botón; sin esto el
          lector lo leería dos veces. En móvil solo cabe un punto. */}
      <span aria-hidden="true">
        <span
          className={`block h-1.5 w-1.5 rounded-full sm:hidden ${
            isSelected ? 'bg-white' : 'bg-neutral-900'
          }`}
        />
        <span
          className={`hidden rounded px-1.5 py-0.5 text-xs sm:block ${
            isSelected ? 'bg-white/20' : 'bg-neutral-900 text-white'
          }`}
        >
          {count}
        </span>
      </span>
    </button>
  );
}
