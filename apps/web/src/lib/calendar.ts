// Utilidades de fechas del calendario de subastas. Funciones PURAS, sin React:
// es donde vive la parte que se puede equivocar de verdad (zonas horarias), y
// aislarla aquí la hace testeable sin montar componentes.
//
// Sin librería de fechas: el proyecto no tiene ninguna y `Intl` ya resuelve la
// zona horaria, que es lo único no trivial de esto.

// Toda la web opera en hora española: el almacén está aquí y las subastas cierran
// en hora local. El backend guarda SIEMPRE en UTC.
const TIME_ZONE = 'Europe/Madrid';

// 'sv-SE' es el truco: es el locale que formatea como `YYYY-MM-DD`, justo la clave
// que queremos, sin tener que recomponerla a mano desde formatToParts.
const DAY_FORMAT = new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE });

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const TIME_FORMAT = new Intl.DateTimeFormat('es-ES', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});

const MONTH_FORMAT = new Intl.DateTimeFormat('es-ES', {
  timeZone: TIME_ZONE,
  month: 'long',
  year: 'numeric',
});

const LONG_DAY_FORMAT = new Intl.DateTimeFormat('es-ES', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

// La rejilla siempre son 6 semanas: así no cambia de alto al navegar entre meses
// (un mes de 28 días caben en 5 semanas y otro de 31 puede necesitar 6).
export const GRID_WEEKS = 6;
export const GRID_DAYS = GRID_WEEKS * 7;

// Lunes primero, convención española. `Date.getUTCDay()` devuelve 0=domingo, así
// que hay que rotarlo.
export const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// Un día de la rejilla. `key` es su fecha en formato YYYY-MM-DD y es la clave con
// la que se cruzan las subastas (ver `dayKey`).
export interface CalendarDay {
  key: string;
  dayOfMonth: number;
  // false para los días de relleno del mes anterior/siguiente, que se pintan en
  // gris pero SÍ muestran sus subastas (si no, la primera fila mentiría).
  inMonth: boolean;
}

// Mes visible, con el mes en base 0 igual que `Date` (0 = enero), para no mezclar
// dos convenciones dentro del mismo fichero.
export interface VisibleMonth {
  year: number;
  month: number;
}

// --- Aritmética de días naturales ------------------------------------------

// Fecha NOMINAL (un día del calendario, sin hora ni zona) representada como un
// Date en el mediodía UTC. El mediodía es a propósito: deja 12 h de margen a cada
// lado, así ningún cambio de hora ni desfase horario puede empujar la fecha al día
// anterior o siguiente al hacer aritmética. Estos Date NO son instantes reales,
// solo un soporte para contar días.
function nominalDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 12));
}

function nominalKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// --- Cruce de subastas con días --------------------------------------------

// Día natural EN HORA ESPAÑOLA en el que cae un instante ISO devuelto por la API.
//
// Ojo, aquí está el fallo fácil: `endsAt` viene en UTC, y hacer
// `iso.slice(0, 10)` o `new Date(iso).toISOString().slice(0, 10)` agrupa por el
// día UTC. Una subasta que cierra el 1 de julio a las 00:30 hora española es
// `2026-06-30T22:30:00Z` en UTC, así que caería en el 30 de junio de la rejilla.
// Solo falla en las subastas de madrugada y solo en horario de verano, que es la
// peor combinación posible para detectarlo por casualidad.
export function dayKey(iso: string): string {
  return DAY_FORMAT.format(new Date(iso));
}

export function todayKey(): string {
  return DAY_FORMAT.format(new Date());
}

// --- Rejilla del mes --------------------------------------------------------

// Los 42 días de la rejilla, empezando en lunes, incluyendo el relleno del mes
// anterior y el siguiente.
export function monthGrid({ year, month }: VisibleMonth): CalendarDay[] {
  const first = nominalDay(year, month, 1);
  // getUTCDay(): 0=domingo … 6=sábado. +6 % 7 lo rota a 0=lunes … 6=domingo.
  const leading = (first.getUTCDay() + 6) % 7;

  return Array.from({ length: GRID_DAYS }, (_, i) => {
    // `Date.UTC` normaliza los desbordes solo (día 0 = último del mes anterior,
    // día 32 de enero = 1 de febrero), así que no hace falta tratar los bordes.
    const date = nominalDay(year, month, 1 - leading + i);
    return {
      key: nominalKey(date),
      dayOfMonth: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month && date.getUTCFullYear() === year,
    };
  });
}

// --- Rango que se pide a la API ---------------------------------------------

// Desfase de Madrid respecto a UTC en un instante dado, en milisegundos (+2 h en
// verano, +1 h en invierno). Se calcula formateando el instante en Madrid y
// releyendo ese texto como si fuera UTC: la diferencia entre ambos ES el desfase.
function timeZoneOffsetMs(at: Date): number {
  const asIfUtc = new Date(`${DATE_TIME_FORMAT.format(at).replace(' ', 'T')}Z`);
  return asIfUtc.getTime() - at.getTime();
}

// Instante UTC real en el que empieza (00:00) un día natural español.
//
// No se puede usar `new Date(key + 'T00:00:00')` porque eso interpreta la fecha en
// la zona del NAVEGADOR, que no tiene por qué ser la española. Se parte de la
// medianoche UTC y se resta el desfase que Madrid tenía ese día.
//
// La medianoche es un momento seguro para esto: los cambios de hora ocurren de
// madrugada (2:00/3:00), así que las 00:00 de un día español siempre existen y son
// únicas — no hay ambigüedad que resolver.
export function startOfDayUtc(key: string): Date {
  const midnightUtc = new Date(`${key}T00:00:00.000Z`);
  return new Date(midnightUtc.getTime() - timeZoneOffsetMs(midnightUtc));
}

// Rango `[from, to)` que cubre TODA la rejilla, no solo el mes.
//
// Es la diferencia que importa: si el mes empieza en jueves, los tres primeros
// días de la rejilla son del mes anterior, y pidiendo solo el mes esos días
// saldrían vacíos aunque tuvieran subastas. Y no daría ningún error: simplemente
// mentiría.
//
// `to` es el arranque del día SIGUIENTE al último de la rejilla, para que el rango
// semiabierto del backend incluya el último día completo.
export function monthRange(visible: VisibleMonth): { from: string; to: string } {
  const grid = monthGrid(visible);
  const firstKey = grid[0].key;
  const lastKey = grid[grid.length - 1].key;

  const dayAfterLast = new Date(`${lastKey}T12:00:00.000Z`);
  dayAfterLast.setUTCDate(dayAfterLast.getUTCDate() + 1);

  return {
    from: startOfDayUtc(firstKey).toISOString(),
    to: startOfDayUtc(nominalKey(dayAfterLast)).toISOString(),
  };
}

// --- Navegación y etiquetas -------------------------------------------------

// `?mes=2026-08` → mes visible. Si el parámetro falta o está corrupto, cae al mes
// actual: una URL manipulada no debe romper la página.
export function parseMonthParam(value: string | null): VisibleMonth {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    if (month >= 0 && month <= 11) return { year, month };
  }
  const [year, month] = todayKey().split('-');
  return { year: Number(year), month: Number(month) - 1 };
}

export function formatMonthParam({ year, month }: VisibleMonth): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

// Suma meses al mes visible. `Date.UTC` normaliza el desborde (mes 12 → enero del
// año siguiente, mes -1 → diciembre del anterior), así que no hay casos aparte.
export function shiftMonth(
  { year, month }: VisibleMonth,
  delta: number,
): VisibleMonth {
  const date = nominalDay(year, month + delta, 1);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

export function currentMonth(): VisibleMonth {
  return parseMonthParam(null);
}

// ¿Es `?dia=` una fecha con la forma que esperamos? La URL la escribe el usuario,
// así que hay que comprobarlo antes de derivar nada de ella. Solo valida la FORMA:
// un 2026-02-31 pasa el filtro y simplemente no casará con ningún día de la
// rejilla, que es un fallo inocuo (panel vacío, no una página rota).
export function isDayKey(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// El mes visible al que pertenece un día concreto (para que entrar con `?dia=`
// abra el mes correcto).
export function monthOfDay(key: string): VisibleMonth {
  const [year, month] = key.split('-');
  return { year: Number(year), month: Number(month) - 1 };
}

// "agosto de 2026", capitalizado (Intl lo devuelve en minúscula en español).
export function monthLabel(visible: VisibleMonth): string {
  const label = MONTH_FORMAT.format(nominalDay(visible.year, visible.month, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// "viernes, 14 de agosto", para el encabezado del panel del día.
export function dayLabel(key: string): string {
  const label = LONG_DAY_FORMAT.format(new Date(`${key}T12:00:00.000Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Hora de cierre en hora española ("19:30").
export function formatTime(iso: string): string {
  return TIME_FORMAT.format(new Date(iso));
}
