import { describe, expect, it } from 'vitest';
import {
  GRID_DAYS,
  dayKey,
  formatMonthParam,
  monthGrid,
  monthRange,
  parseMonthParam,
  shiftMonth,
  startOfDayUtc,
} from './calendar';

// Estos tests se ejecutan con TZ=America/New_York (ver el script `test` de
// package.json) A PROPÓSITO: si alguna función se apoyara en la hora local del
// navegador en vez de forzar Europa/Madrid, fallaría aquí. En la máquina de
// desarrollo, que ya está en hora española, el fallo pasaría desapercibido.
describe('dayKey', () => {
  // EL test de este fichero. `endsAt` llega en UTC; agrupar por el día UTC mete
  // las subastas de madrugada en el día anterior durante el horario de verano.
  it('agrupa por el día español, no por el UTC (horario de verano)', () => {
    // 1 de julio de 2026, 00:30 en España = 30 de junio, 22:30 UTC.
    expect(dayKey('2026-06-30T22:30:00.000Z')).toBe('2026-07-01');
  });

  it('agrupa correctamente también en horario de invierno', () => {
    // En invierno España va +1 h: 1 de enero, 00:30 = 31 de diciembre, 23:30 UTC.
    expect(dayKey('2025-12-31T23:30:00.000Z')).toBe('2026-01-01');
  });

  it('deja en su día las horas centrales', () => {
    expect(dayKey('2026-08-14T17:00:00.000Z')).toBe('2026-08-14');
  });
});

describe('monthGrid', () => {
  it('siempre devuelve 6 semanas completas', () => {
    expect(monthGrid({ year: 2026, month: 7 })).toHaveLength(GRID_DAYS);
    // Febrero de 2027 tiene 28 días y empieza en lunes: cabe en 4 semanas, pero
    // la rejilla no cambia de alto.
    expect(monthGrid({ year: 2027, month: 1 })).toHaveLength(GRID_DAYS);
  });

  it('empieza en lunes y rellena con el mes anterior', () => {
    // El 1 de agosto de 2026 es sábado, así que la rejilla arranca el lunes 27
    // de julio con 5 días de relleno.
    const grid = monthGrid({ year: 2026, month: 7 });
    expect(grid[0]).toEqual({
      key: '2026-07-27',
      dayOfMonth: 27,
      inMonth: false,
    });
    expect(grid[5]).toEqual({ key: '2026-08-01', dayOfMonth: 1, inMonth: true });
  });

  it('no rellena por delante cuando el mes ya empieza en lunes', () => {
    // El 1 de junio de 2026 es lunes.
    const grid = monthGrid({ year: 2026, month: 5 });
    expect(grid[0]).toEqual({ key: '2026-06-01', dayOfMonth: 1, inMonth: true });
  });

  it('cruza el cambio de año en el relleno final', () => {
    const grid = monthGrid({ year: 2026, month: 11 });
    expect(grid[grid.length - 1].key.startsWith('2027-01')).toBe(true);
  });
});

describe('startOfDayUtc', () => {
  it('resta 2 h en horario de verano', () => {
    expect(startOfDayUtc('2026-08-01').toISOString()).toBe(
      '2026-07-31T22:00:00.000Z',
    );
  });

  it('resta 1 h en horario de invierno', () => {
    expect(startOfDayUtc('2026-01-01').toISOString()).toBe(
      '2025-12-31T23:00:00.000Z',
    );
  });
});

describe('monthRange', () => {
  // Si el rango cubriera solo el mes, los días de relleno saldrían vacíos aunque
  // tuvieran subastas — y sin dar ningún error.
  it('cubre toda la rejilla, no solo el mes', () => {
    const { from, to } = monthRange({ year: 2026, month: 7 });
    // Arranca en el lunes 27 de julio (00:00 hora española).
    expect(from).toBe('2026-07-26T22:00:00.000Z');
    // 42 días después el último de la rejilla es el 6 de septiembre, así que el
    // rango cierra al empezar el día 7.
    expect(to).toBe('2026-09-06T22:00:00.000Z');
  });

  it('nunca supera el tope de ventana del backend (62 días)', () => {
    for (let month = 0; month < 12; month++) {
      const { from, to } = monthRange({ year: 2026, month });
      const days =
        (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
      expect(days).toBeLessThanOrEqual(62);
    }
  });
});

describe('parseMonthParam', () => {
  it('lee el parámetro de la URL', () => {
    expect(parseMonthParam('2026-08')).toEqual({ year: 2026, month: 7 });
  });

  // Una URL manipulada no puede romper la página: cae al mes actual.
  it('cae al mes actual con un valor corrupto o ausente', () => {
    const now = parseMonthParam(null);
    expect(parseMonthParam('pepito')).toEqual(now);
    expect(parseMonthParam('2026-13')).toEqual(now);
  });

  it('va y vuelve con formatMonthParam', () => {
    expect(formatMonthParam({ year: 2026, month: 0 })).toBe('2026-01');
    expect(parseMonthParam(formatMonthParam({ year: 2026, month: 11 }))).toEqual(
      { year: 2026, month: 11 },
    );
  });
});

describe('shiftMonth', () => {
  it('cruza el cambio de año en ambos sentidos', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({
      year: 2027,
      month: 0,
    });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({
      year: 2025,
      month: 11,
    });
  });
});
