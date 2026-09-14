import { describe, expect, it } from 'vitest';
import {
  SESSION_IDLE_LIMIT_MINUTES,
  continuesIdleSession,
  idleSessionEndAt,
  lastSessionActivityAt,
} from '../src/domain/session-idle';

const START = '2026-09-14T10:00:00.000Z';

const minutesAfter = (iso: string, minutes: number): Date =>
  new Date(Date.parse(iso) + minutes * 60_000);

describe('lastSessionActivityAt', () => {
  it('sin series, la última actividad es el comienzo', () => {
    expect(lastSessionActivityAt({ startedAt: START, setCompletedAts: [] })).toBe(START);
  });

  it('es la serie más reciente aunque lleguen desordenadas', () => {
    expect(
      lastSessionActivityAt({
        startedAt: START,
        setCompletedAts: [
          '2026-09-14T10:30:00.000Z',
          '2026-09-14T10:45:00.000Z',
          '2026-09-14T10:10:00.000Z',
        ],
      }),
    ).toBe('2026-09-14T10:45:00.000Z');
  });

  it('compara instantes y no texto: una hora con desfase se ordena bien', () => {
    // 12:40+02:00 son las 10:40 UTC: más tarde que 10:30Z aunque como texto parezca otra cosa.
    expect(
      lastSessionActivityAt({
        startedAt: START,
        setCompletedAts: ['2026-09-14T10:30:00.000Z', '2026-09-14T12:40:00.000+02:00'],
      }),
    ).toBe('2026-09-14T12:40:00.000+02:00');
  });
});

describe('SESSION_IDLE_LIMIT_MINUTES', () => {
  it('es una hora: con veinte minutos se cortaban entrenamientos de verdad (ADR 0008)', () => {
    expect(SESSION_IDLE_LIMIT_MINUTES).toBe(60);
  });
});

describe('idleSessionEndAt', () => {
  const activity = { startedAt: START, setCompletedAts: ['2026-09-14T10:25:00.000Z'] };

  it('sigue viva antes del límite sin actividad', () => {
    expect(
      idleSessionEndAt(
        activity,
        minutesAfter('2026-09-14T10:25:00.000Z', SESSION_IDLE_LIMIT_MINUTES - 1),
      ),
    ).toBeNull();
  });

  it('al cumplir el límite se cierra, y a la hora de la última serie', () => {
    expect(
      idleSessionEndAt(
        activity,
        minutesAfter('2026-09-14T10:25:00.000Z', SESSION_IDLE_LIMIT_MINUTES),
      ),
    ).toBe('2026-09-14T10:25:00.000Z');
    expect(idleSessionEndAt(activity, minutesAfter(START, 60 * 24))).toBe(
      '2026-09-14T10:25:00.000Z',
    );
  });

  it('una sesión empezada y sin series se cierra a la hora a la que empezó', () => {
    expect(
      idleSessionEndAt(
        { startedAt: START, setCompletedAts: [] },
        minutesAfter(START, SESSION_IDLE_LIMIT_MINUTES + 5),
      ),
    ).toBe(START);
  });
});

describe('continuesIdleSession', () => {
  const endedAt = '2026-09-14T10:25:00.000Z';

  it('una serie dentro del margen continúa la sesión que se cerró sola', () => {
    expect(continuesIdleSession(endedAt, '2026-09-14T10:40:00.000Z')).toBe(true);
    expect(
      continuesIdleSession(
        endedAt,
        minutesAfter(endedAt, SESSION_IDLE_LIMIT_MINUTES - 1).toISOString(),
      ),
    ).toBe(true);
    expect(continuesIdleSession(endedAt, '2026-09-14T10:20:00.000Z')).toBe(true);
  });

  it('una serie al cumplir el límite o más tarde ya es otro entrenamiento', () => {
    expect(
      continuesIdleSession(
        endedAt,
        minutesAfter(endedAt, SESSION_IDLE_LIMIT_MINUTES).toISOString(),
      ),
    ).toBe(false);
    expect(continuesIdleSession(endedAt, '2026-09-14T18:00:00.000Z')).toBe(false);
  });

  it('una hora ilegible no reabre nada', () => {
    expect(continuesIdleSession(endedAt, 'no es una fecha')).toBe(false);
  });
});
