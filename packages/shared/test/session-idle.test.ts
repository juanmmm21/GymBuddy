import { describe, expect, it } from 'vitest';
import {
  CARDIO_IN_PROGRESS_LIMIT_MINUTES,
  SESSION_IDLE_LIMIT_MINUTES,
  cardioKeepsSessionAlive,
  cardioSetStartedAt,
  continuesIdleSession,
  endsCardioInProgress,
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

describe('cardio en marcha', () => {
  const lastSet = '2026-09-14T10:25:00.000Z';
  const cardioStartedAt = '2026-09-14T11:00:00.000Z';
  const activity = { startedAt: START, setCompletedAts: [lastSet], cardioStartedAt };

  it('empezar el cardio es actividad: pasa a ser la última', () => {
    expect(lastSessionActivityAt(activity)).toBe(cardioStartedAt);
    expect(lastSessionActivityAt({ ...activity, cardioStartedAt: null })).toBe(lastSet);
  });

  it('mientras dura, la sesión no se cierra aunque pase más de una hora sin series', () => {
    expect(idleSessionEndAt(activity, minutesAfter(cardioStartedAt, 90))).toBeNull();
    expect(
      idleSessionEndAt(
        activity,
        minutesAfter(cardioStartedAt, CARDIO_IN_PROGRESS_LIMIT_MINUTES - 1),
      ),
    ).toBeNull();
  });

  it('un cardio olvidado deja de contar al cumplir su tope, y la sesión se cierra cuando empezó', () => {
    expect(CARDIO_IN_PROGRESS_LIMIT_MINUTES).toBe(180);
    expect(
      idleSessionEndAt(activity, minutesAfter(cardioStartedAt, CARDIO_IN_PROGRESS_LIMIT_MINUTES)),
    ).toBe(cardioStartedAt);
  });

  it('una hora de cardio ilegible no mantiene viva la sesión', () => {
    expect(cardioKeepsSessionAlive('no es una fecha', minutesAfter(START, 5))).toBe(false);
    expect(cardioKeepsSessionAlive(null, minutesAfter(START, 5))).toBe(false);
    expect(cardioKeepsSessionAlive(undefined, minutesAfter(START, 5))).toBe(false);
  });

  it('un cardio que empieza después de ahora (reloj adelantado) sigue en marcha', () => {
    expect(cardioKeepsSessionAlive(cardioStartedAt, minutesAfter(START, 30))).toBe(true);
  });
});

describe('cardioSetStartedAt', () => {
  it('una serie de cardio empezó su duración antes de apuntarse', () => {
    expect(cardioSetStartedAt('2026-09-14T11:30:00.000Z', 1_800)).toBe('2026-09-14T11:00:00.000Z');
  });

  it('respeta el desfase horario comparando instantes', () => {
    expect(cardioSetStartedAt('2026-09-14T13:30:00.000+02:00', 600)).toBe(
      '2026-09-14T11:20:00.000Z',
    );
  });

  it('con una hora ilegible devuelve la misma, que luego no reabre nada', () => {
    expect(cardioSetStartedAt('no es una fecha', 600)).toBe('no es una fecha');
  });

  it('media hora de cinta apuntada fuera del margen continúa la sesión si empezó dentro', () => {
    const endedAt = '2026-09-14T10:25:00.000Z';
    const loggedAt = minutesAfter(endedAt, SESSION_IDLE_LIMIT_MINUTES + 10).toISOString();

    expect(continuesIdleSession(endedAt, loggedAt)).toBe(false);
    expect(continuesIdleSession(endedAt, cardioSetStartedAt(loggedAt, 1_800))).toBe(true);
  });
});

describe('endsCardioInProgress', () => {
  const cardioStartedAt = '2026-09-14T11:00:00.000Z';

  it('un cardio apuntado después de empezar el que corre lo apaga', () => {
    expect(endsCardioInProgress(cardioStartedAt, '2026-09-14T11:30:00.000Z')).toBe(true);
    expect(endsCardioInProgress(cardioStartedAt, cardioStartedAt)).toBe(true);
  });

  it('uno que terminó antes, llegado tarde de la cola, no lo apaga', () => {
    expect(endsCardioInProgress(cardioStartedAt, '2026-09-14T10:50:00.000Z')).toBe(false);
    expect(endsCardioInProgress(cardioStartedAt, '2026-09-14T12:50:00.000+02:00')).toBe(false);
  });

  it('con una hora ilegible lo apaga: mejor que dejar un cardio corriendo sin fin', () => {
    expect(endsCardioInProgress('no es una fecha', cardioStartedAt)).toBe(true);
  });
});
