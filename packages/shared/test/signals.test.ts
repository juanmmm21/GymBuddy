import { describe, expect, it } from 'vitest';
import type { SessionTopSet } from '../src/domain/progression';
import {
  daysSinceLastSession,
  detectStagnation,
  sessionsThisWeek,
  suggestedIncrementGrams,
  weeklyStreak,
} from '../src/domain/signals';

/** Lunes 24 de agosto de 2026, media tarde. Todas las fechas del fichero cuelgan de aquí. */
const NOW = new Date('2026-08-24T18:00:00.000Z');

const top = (startedAt: string, weightGrams: number, reps = 8): SessionTopSet => ({
  sessionId: startedAt,
  startedAt,
  weightGrams,
  reps,
});

describe('daysSinceLastSession', () => {
  it('cuenta periodos completos de veinticuatro horas', () => {
    expect(daysSinceLastSession('2026-08-24T06:00:00.000Z', NOW)).toBe(0);
    expect(daysSinceLastSession('2026-08-22T19:00:00.000Z', NOW)).toBe(1);
    expect(daysSinceLastSession('2026-08-17T18:00:00.000Z', NOW)).toBe(7);
  });

  it('sin ninguna sesión no es cero, es que no hay dato', () => {
    expect(daysSinceLastSession(null, NOW)).toBeNull();
  });

  it('una marca en el futuro por un reloj adelantado son cero días, no negativos', () => {
    expect(daysSinceLastSession('2026-08-24T19:30:00.000Z', NOW)).toBe(0);
  });
});

describe('weeklyStreak', () => {
  it('cuenta semanas seguidas con al menos una sesión', () => {
    const starts = [
      '2026-08-24T18:00:00.000Z',
      '2026-08-22T10:00:00.000Z',
      '2026-08-19T18:00:00.000Z',
      '2026-08-11T18:00:00.000Z',
    ];

    expect(weeklyStreak(starts, NOW)).toBe(3);
  });

  it('la semana en curso todavía sin sesión no rompe la racha', () => {
    // Martes 25: aún no se ha entrenado esta semana, pero las dos anteriores sí.
    const tuesday = new Date('2026-08-25T09:00:00.000Z');
    const starts = ['2026-08-19T18:00:00.000Z', '2026-08-12T18:00:00.000Z'];

    expect(weeklyStreak(starts, tuesday)).toBe(2);
  });

  it('dos semanas seguidas en blanco sí la rompen', () => {
    expect(weeklyStreak(['2026-08-12T18:00:00.000Z'], NOW)).toBe(0);
  });

  it('sin sesiones la racha es cero', () => {
    expect(weeklyStreak([], NOW)).toBe(0);
  });
});

describe('sessionsThisWeek', () => {
  it('solo cuenta las de la semana en curso, que empieza el lunes', () => {
    const starts = [
      '2026-08-24T18:00:00.000Z',
      '2026-08-23T18:00:00.000Z',
      '2026-08-19T18:00:00.000Z',
    ];

    // El domingo 23 pertenece a la semana anterior: la semana empieza en lunes.
    expect(sessionsThisWeek(starts, NOW)).toBe(1);
  });
});

describe('suggestedIncrementGrams', () => {
  it('sube de cinco en cinco el tren inferior y el core', () => {
    expect(suggestedIncrementGrams('legs')).toBe(5000);
    expect(suggestedIncrementGrams('core')).toBe(5000);
  });

  it('usa el disco pequeño en el tren superior y en lo que no sabe clasificar', () => {
    expect(suggestedIncrementGrams('chest')).toBe(2500);
    expect(suggestedIncrementGrams('arms')).toBe(2500);
    expect(suggestedIncrementGrams('cardio')).toBe(2500);
    expect(suggestedIncrementGrams(null)).toBe(2500);
  });
});

describe('detectStagnation', () => {
  const threeEqual = [
    top('2026-08-24T18:00:00.000Z', 82_500),
    top('2026-08-17T18:00:00.000Z', 82_500),
    top('2026-08-10T18:00:00.000Z', 82_500),
  ];

  it('avisa tras tres sesiones seguidas con el mismo peso', () => {
    expect(detectStagnation(threeEqual, 'chest')).toStrictEqual({
      weightGrams: 82_500,
      sessions: 3,
      suggestedIncrementGrams: 2500,
    });
  });

  it('con dos sesiones todavía no avisa', () => {
    expect(detectStagnation(threeEqual.slice(0, 2), 'chest')).toBeNull();
  });

  it('la racha se corta en la primera sesión con otro peso', () => {
    const sets = [
      top('2026-08-24T18:00:00.000Z', 82_500),
      top('2026-08-17T18:00:00.000Z', 82_500),
      top('2026-08-10T18:00:00.000Z', 80_000),
      top('2026-08-03T18:00:00.000Z', 82_500),
    ];

    expect(detectStagnation(sets, 'chest')).toBeNull();
  });

  it('no sugiere subir a quien repite peso perdiendo repeticiones', () => {
    const losingReps = [
      top('2026-08-24T18:00:00.000Z', 82_500, 5),
      top('2026-08-17T18:00:00.000Z', 82_500, 7),
      top('2026-08-10T18:00:00.000Z', 82_500, 8),
    ];

    expect(detectStagnation(losingReps, 'chest')).toBeNull();
  });

  it('con un rango objetivo exige alcanzarlo en todas las sesiones de la racha', () => {
    const belowTarget = [
      top('2026-08-24T18:00:00.000Z', 82_500, 8),
      top('2026-08-17T18:00:00.000Z', 82_500, 8),
      top('2026-08-10T18:00:00.000Z', 82_500, 5),
    ];

    expect(detectStagnation(belowTarget, 'chest', { min: 8, max: 12 })).toBeNull();
    expect(detectStagnation(threeEqual, 'chest', { min: 8, max: 12 })?.sessions).toBe(3);
  });

  it('ordena por fecha y no por el orden en el que le llegan las sesiones', () => {
    const shuffled = [threeEqual[1], threeEqual[2], threeEqual[0]].filter(
      (entry): entry is SessionTopSet => entry !== undefined,
    );

    expect(detectStagnation(shuffled, 'legs')?.suggestedIncrementGrams).toBe(5000);
  });

  it('sin sesiones no hay señal', () => {
    expect(detectStagnation([], 'legs')).toBeNull();
  });
});
