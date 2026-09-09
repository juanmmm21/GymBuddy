import { describe, expect, it } from 'vitest';
import type { ProgressionSet } from '../src/domain/progression';
import {
  dayIndexOf,
  isoDateOfDay,
  weekIndexOf,
  weekStartDayIndex,
  weeklyBodyPartCalendar,
  type WeekSetEntry,
} from '../src/domain/week';
import type { BodyPart } from '../src/schemas/catalog';

/** Jueves 10 de septiembre de 2026, media tarde. Su semana empieza el lunes 7. */
const NOW = new Date('2026-09-10T18:00:00.000Z');

const MONDAY = '2026-09-07T18:00:00.000Z';
const WEDNESDAY = '2026-09-09T19:00:00.000Z';
const THURSDAY = '2026-09-10T07:30:00.000Z';

const set = (weightGrams: number, reps: number, isWarmup = false): ProgressionSet => ({
  weightGrams,
  reps,
  isWarmup,
  completedAt: NOW.toISOString(),
});

const entry = (
  sessionStartedAt: string,
  bodyPart: BodyPart | null,
  progressionSet: ProgressionSet,
): WeekSetEntry => ({ sessionStartedAt, bodyPart, set: progressionSet });

describe('aritmética de la semana', () => {
  it('la semana empieza el lunes', () => {
    const sunday = Date.parse('2026-09-06T23:59:59.000Z');
    const monday = Date.parse('2026-09-07T00:00:00.000Z');

    expect(weekIndexOf(monday)).toBe(weekIndexOf(sunday) + 1);
  });

  it('el lunes de la semana en curso es el 7 de septiembre', () => {
    expect(isoDateOfDay(weekStartDayIndex(weekIndexOf(NOW.getTime())))).toBe('2026-09-07');
  });

  it('un día son veinticuatro horas completas en UTC', () => {
    expect(dayIndexOf(Date.parse('2026-09-10T23:59:59.999Z'))).toBe(
      dayIndexOf(Date.parse('2026-09-10T00:00:00.000Z')),
    );
    expect(dayIndexOf(Date.parse('2026-09-11T00:00:00.000Z'))).toBe(
      dayIndexOf(Date.parse('2026-09-10T00:00:00.000Z')) + 1,
    );
  });
});

describe('weeklyBodyPartCalendar', () => {
  it('devuelve siempre los siete días, de lunes a domingo', () => {
    const days = weeklyBodyPartCalendar([], NOW);

    expect(days).toHaveLength(7);
    expect(days.map((day) => day.dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(days.map((day) => day.date)).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
    expect(days.every((day) => !day.trained)).toBe(true);
  });

  it('etiqueta cada día con la parte del cuerpo de más volumen', () => {
    const days = weeklyBodyPartCalendar(
      [
        entry(MONDAY, 'chest', set(80_000, 8)),
        entry(MONDAY, 'chest', set(80_000, 8)),
        entry(MONDAY, 'arms', set(20_000, 10)),
        entry(WEDNESDAY, 'legs', set(100_000, 5)),
      ],
      NOW,
    );

    expect(days[0]?.bodyPart).toBe('chest');
    expect(days[0]?.volumeGrams).toBe(80_000 * 8 * 2 + 20_000 * 10);
    expect(days[0]?.setCount).toBe(3);
    expect(days[2]?.bodyPart).toBe('legs');
    expect(days[1]?.trained).toBe(false);
  });

  it('el día lo pone la sesión, no la serie: una sesión que cruza la medianoche no se parte', () => {
    // La sesión empezó el miércoles a las 19:00 y la última serie cayó ya en jueves.
    const late: ProgressionSet = {
      weightGrams: 60_000,
      reps: 10,
      isWarmup: false,
      completedAt: '2026-09-10T00:10:00.000Z',
    };

    const days = weeklyBodyPartCalendar([entry(WEDNESDAY, 'back', late)], NOW);

    expect(days[2]?.bodyPart).toBe('back');
    expect(days[3]?.trained).toBe(false);
  });

  it('un día de ejercicios propios sin clasificar entrenó, pero no se le inventa etiqueta', () => {
    const days = weeklyBodyPartCalendar([entry(THURSDAY, null, set(40_000, 12))], NOW);

    expect(days[3]?.trained).toBe(true);
    expect(days[3]?.bodyPart).toBeNull();
    expect(days[3]?.volumeGrams).toBe(40_000 * 12);
  });

  it('lo que no se puede clasificar suma al día pero no compite por la etiqueta', () => {
    const days = weeklyBodyPartCalendar(
      [entry(THURSDAY, null, set(100_000, 10)), entry(THURSDAY, 'arms', set(10_000, 10))],
      NOW,
    );

    expect(days[3]?.bodyPart).toBe('arms');
    expect(days[3]?.volumeGrams).toBe(100_000 * 10 + 10_000 * 10);
  });

  it('con todo a peso corporal manda el número de series', () => {
    const days = weeklyBodyPartCalendar(
      [
        entry(THURSDAY, 'chest', set(0, 20)),
        entry(THURSDAY, 'core', set(0, 20)),
        entry(THURSDAY, 'core', set(0, 20)),
      ],
      NOW,
    );

    expect(days[3]?.bodyPart).toBe('core');
    expect(days[3]?.volumeGrams).toBe(0);
    expect(days[3]?.setCount).toBe(3);
  });

  it('el empate perfecto se rompe siempre igual, para que la etiqueta no baile', () => {
    const first = weeklyBodyPartCalendar(
      [entry(THURSDAY, 'legs', set(50_000, 10)), entry(THURSDAY, 'back', set(50_000, 10))],
      NOW,
    );
    const reversed = weeklyBodyPartCalendar(
      [entry(THURSDAY, 'back', set(50_000, 10)), entry(THURSDAY, 'legs', set(50_000, 10))],
      NOW,
    );

    expect(first[3]?.bodyPart).toBe('back');
    expect(reversed[3]?.bodyPart).toBe('back');
  });

  it('un día de solo calentamiento cuenta como entrenado y no suma volumen', () => {
    const days = weeklyBodyPartCalendar([entry(THURSDAY, 'chest', set(40_000, 10, true))], NOW);

    expect(days[3]?.trained).toBe(true);
    expect(days[3]?.bodyPart).toBeNull();
    expect(days[3]?.volumeGrams).toBe(0);
    expect(days[3]?.setCount).toBe(0);
  });

  it('descarta lo que no es de la semana en curso, incluida una fecha ilegible', () => {
    const days = weeklyBodyPartCalendar(
      [
        entry('2026-09-06T18:00:00.000Z', 'chest', set(80_000, 8)),
        entry('2026-09-14T18:00:00.000Z', 'legs', set(80_000, 8)),
        entry('el lunes por la tarde', 'back', set(80_000, 8)),
      ],
      NOW,
    );

    expect(days.every((day) => !day.trained)).toBe(true);
  });
});
