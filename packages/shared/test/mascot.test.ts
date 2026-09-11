import { describe, expect, it } from 'vitest';
import {
  CELEBRATION_WINDOW_SECONDS,
  NO_DEVICE_SIGNALS,
  NUDGE_AFTER_DAYS,
  SLEEPY_AFTER_DAYS,
  STALE_SESSION_HOURS,
  mascotState,
  type MascotDeviceSignals,
  type MascotTrainingSignals,
} from '../src/domain/mascot';
import { trainingSignalsSchema } from '../src/schemas/stats';

/** Lunes 24 de agosto de 2026, media tarde. Todas las fechas del fichero cuelgan de aquí. */
const NOW = new Date('2026-08-24T18:00:00.000Z');

const SESSION_ID = '0b9d4c1e-6f2a-4c3b-9e8d-7a6b5c4d3e2f';
const BENCH_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const SQUAT_ID = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';

const secondsBefore = (seconds: number): string =>
  new Date(NOW.getTime() - seconds * 1000).toISOString();

const daysBefore = (days: number): string => secondsBefore(days * 86_400);

/** Alguien que entrenó ayer, sin sesión abierta, sin marcas ni estancamientos. */
const onTrack: MascotTrainingSignals = {
  lastSessionAt: daysBefore(1),
  activeSessionId: null,
  latestRecord: null,
  stalled: [],
};

/** En el gimnasio: la sesión se abrió hace media hora. */
const atTheGym: MascotTrainingSignals = {
  ...onTrack,
  lastSessionAt: secondsBefore(1800),
  activeSessionId: SESSION_ID,
};

const restingFor = (elapsedSeconds: number, targetSeconds = 120): MascotDeviceSignals => ({
  rest: { lastSetAt: secondsBefore(elapsedSeconds), targetSeconds },
  freshRecords: [],
});

describe('mascotState — idle', () => {
  it('quien no ha entrenado nunca espera tranquila, sin reproches', () => {
    const neverTrained: MascotTrainingSignals = { ...onTrack, lastSessionAt: null };

    expect(mascotState(neverTrained, NO_DEVICE_SIGNALS, NOW)).toStrictEqual({
      mood: 'idle',
      reason: 'never_trained',
    });
  });

  it('quien va al día, sin sesión abierta ni nada pendiente, no tiene nada que decir', () => {
    expect(mascotState(onTrack, NO_DEVICE_SIGNALS, NOW)).toStrictEqual({
      mood: 'idle',
      reason: 'on_track',
    });
  });
});

describe('mascotState — cheering', () => {
  it('idle → cheering al abrir una sesión, antes de la primera serie', () => {
    expect(mascotState(atTheGym, NO_DEVICE_SIGNALS, NOW)).toStrictEqual({
      mood: 'cheering',
      reason: 'session_started',
    });
  });

  it('resting → cheering en el segundo exacto en que se cumple el descanso', () => {
    expect(mascotState(atTheGym, restingFor(120), NOW)).toStrictEqual({
      mood: 'cheering',
      reason: 'rest_over',
    });
  });
});

describe('mascotState — resting', () => {
  it('cheering → resting al registrar una serie: cuenta desde su completedAt', () => {
    expect(mascotState(atTheGym, restingFor(45), NOW)).toStrictEqual({
      mood: 'resting',
      remainingSeconds: 75,
    });
  });

  it('cuenta en segundos completos, igual que el temporizador de la sesión', () => {
    const almostDone: MascotDeviceSignals = {
      rest: { lastSetAt: new Date(NOW.getTime() - 119_999).toISOString(), targetSeconds: 120 },
      freshRecords: [],
    };

    expect(mascotState(atTheGym, almostDone, NOW)).toStrictEqual({
      mood: 'resting',
      remainingSeconds: 1,
    });
  });

  it('una serie con fecha algo futura por el reloj del móvil es un descanso recién empezado', () => {
    expect(mascotState(atTheGym, restingFor(-5), NOW)).toStrictEqual({
      mood: 'resting',
      remainingSeconds: 120,
    });
  });

  it('resting → idle si el Worker ya dice que la sesión se cerró', () => {
    expect(mascotState(onTrack, restingFor(45), NOW)).toStrictEqual({
      mood: 'idle',
      reason: 'on_track',
    });
  });

  it('una fecha de serie ilegible no se cronometra: se anima en vez de descansar', () => {
    const unreadable: MascotDeviceSignals = {
      rest: { lastSetAt: 'ayer por la tarde', targetSeconds: 120 },
      freshRecords: [],
    };

    expect(mascotState(atTheGym, unreadable, NOW).mood).toBe('cheering');
  });
});

describe('mascotState — celebrating', () => {
  it('resting → celebrating con la marca que acaba de devolver el registro de la serie', () => {
    const justBroken: MascotDeviceSignals = {
      ...restingFor(5),
      freshRecords: [{ achievedAt: secondsBefore(5) }],
    };

    expect(mascotState(atTheGym, justBroken, NOW)).toStrictEqual({
      mood: 'celebrating',
      recordAchievedAt: secondsBefore(5),
    });
  });

  it('idle → celebrating con una marca del Worker de hace menos de un minuto', () => {
    const signals: MascotTrainingSignals = {
      ...onTrack,
      latestRecord: { achievedAt: secondsBefore(30) },
    };

    expect(mascotState(signals, NO_DEVICE_SIGNALS, NOW)).toStrictEqual({
      mood: 'celebrating',
      recordAchievedAt: secondsBefore(30),
    });
  });

  it('celebrating → resting cuando la marca cumple la ventana de celebración', () => {
    const expired: MascotDeviceSignals = {
      ...restingFor(CELEBRATION_WINDOW_SECONDS),
      freshRecords: [{ achievedAt: secondsBefore(CELEBRATION_WINDOW_SECONDS) }],
    };

    expect(mascotState(atTheGym, expired, NOW)).toStrictEqual({
      mood: 'resting',
      remainingSeconds: 120 - CELEBRATION_WINDOW_SECONDS,
    });
  });

  it('entre varias marcas celebra la más reciente, venga de donde venga', () => {
    const signals: MascotTrainingSignals = {
      ...atTheGym,
      latestRecord: { achievedAt: secondsBefore(40) },
    };
    const device: MascotDeviceSignals = {
      ...restingFor(10),
      freshRecords: [{ achievedAt: 'no es una fecha' }, { achievedAt: secondsBefore(10) }],
    };

    expect(mascotState(signals, device, NOW)).toStrictEqual({
      mood: 'celebrating',
      recordAchievedAt: secondsBefore(10),
    });
  });
});

describe('mascotState — nudging', () => {
  it('idle → nudging al cumplir los días sin venir', () => {
    const away: MascotTrainingSignals = { ...onTrack, lastSessionAt: daysBefore(NUDGE_AFTER_DAYS) };

    expect(mascotState(away, NO_DEVICE_SIGNALS, NOW)).toStrictEqual({
      mood: 'nudging',
      reason: 'absence',
      daysSinceLastSession: NUDGE_AFTER_DAYS,
    });
  });

  it('un día antes todavía no empuja: es el hueco normal entre dos entrenamientos', () => {
    const regularGap: MascotTrainingSignals = {
      ...onTrack,
      lastSessionAt: daysBefore(NUDGE_AFTER_DAYS - 1),
    };

    expect(mascotState(regularGap, NO_DEVICE_SIGNALS, NOW).mood).toBe('idle');
  });

  it('idle → nudging con ejercicios estancados, con cuáles para poder nombrarlos', () => {
    const stalled: MascotTrainingSignals = {
      ...onTrack,
      stalled: [{ trackedExerciseId: BENCH_ID }, { trackedExerciseId: SQUAT_ID }],
    };

    expect(mascotState(stalled, NO_DEVICE_SIGNALS, NOW)).toStrictEqual({
      mood: 'nudging',
      reason: 'stagnation',
      stalledExerciseIds: [BENCH_ID, SQUAT_ID],
    });
  });
});

describe('mascotState — sleepy', () => {
  it('nudging → sleepy al cumplir una semana entera sin entrenar', () => {
    const gone: MascotTrainingSignals = {
      ...onTrack,
      lastSessionAt: daysBefore(SLEEPY_AFTER_DAYS),
    };

    expect(mascotState(gone, NO_DEVICE_SIGNALS, NOW)).toStrictEqual({
      mood: 'sleepy',
      daysSinceLastSession: SLEEPY_AFTER_DAYS,
    });
  });

  it('sleepy → cheering en cuanto vuelve y abre una sesión', () => {
    const back: MascotTrainingSignals = {
      ...onTrack,
      lastSessionAt: secondsBefore(60),
      activeSessionId: SESSION_ID,
    };

    expect(mascotState(back, NO_DEVICE_SIGNALS, NOW).mood).toBe('cheering');
  });
});

describe('mascotState — sesión olvidada', () => {
  const staleSeconds = STALE_SESSION_HOURS * 3600;

  /** Una sesión que se abrió hace `seconds` y nadie ha cerrado. */
  const openFor = (seconds: number): MascotTrainingSignals => ({
    ...onTrack,
    lastSessionAt: secondsBefore(seconds),
    activeSessionId: SESSION_ID,
  });

  it('cheering → nudging cuando la sesión abierta lleva las horas justas sin moverse', () => {
    expect(mascotState(openFor(staleSeconds - 1), NO_DEVICE_SIGNALS, NOW)).toStrictEqual({
      mood: 'cheering',
      reason: 'session_started',
    });
    expect(mascotState(openFor(staleSeconds), NO_DEVICE_SIGNALS, NOW)).toStrictEqual({
      mood: 'nudging',
      reason: 'forgotten_session',
      openedAt: secondsBefore(staleSeconds),
    });
  });

  it('una serie reciente la mantiene viva aunque se abriera hace más horas', () => {
    const longDay = openFor(staleSeconds * 2);

    expect(mascotState(longDay, restingFor(staleSeconds - 1), NOW)).toStrictEqual({
      mood: 'cheering',
      reason: 'rest_over',
    });
    expect(mascotState(longDay, restingFor(staleSeconds), NOW)).toStrictEqual({
      mood: 'nudging',
      reason: 'forgotten_session',
      openedAt: secondsBefore(staleSeconds * 2),
    });
  });

  it('nudging → cheering al registrar una serie en ella: se ha vuelto a entrenar', () => {
    expect(mascotState(openFor(3 * 86_400), restingFor(200), NOW)).toStrictEqual({
      mood: 'cheering',
      reason: 'rest_over',
    });
  });

  it('gana al sueño y al estancamiento: cerrarla es lo primero que se puede hacer', () => {
    const forgottenForAWeek: MascotTrainingSignals = {
      ...openFor(SLEEPY_AFTER_DAYS * 86_400),
      stalled: [{ trackedExerciseId: BENCH_ID }],
    };

    expect(mascotState(forgottenForAWeek, NO_DEVICE_SIGNALS, NOW)).toStrictEqual({
      mood: 'nudging',
      reason: 'forgotten_session',
      openedAt: daysBefore(SLEEPY_AFTER_DAYS),
    });
  });

  it('una marca recién batida se celebra aunque la sesión parezca olvidada', () => {
    const recordInOldSession: MascotTrainingSignals = {
      ...openFor(staleSeconds * 3),
      latestRecord: { achievedAt: secondsBefore(10) },
    };

    expect(mascotState(recordInOldSession, NO_DEVICE_SIGNALS, NOW).mood).toBe('celebrating');
  });

  it('sin ninguna fecha legible no se da por olvidada', () => {
    const unreadable: MascotTrainingSignals = { ...openFor(0), lastSessionAt: 'no-es-una-fecha' };

    expect(mascotState(unreadable, NO_DEVICE_SIGNALS, NOW)).toStrictEqual({
      mood: 'cheering',
      reason: 'session_started',
    });
  });

  it('sin sesión abierta no hay nada olvidado, por viejo que sea lo último', () => {
    const closedLongAgo: MascotTrainingSignals = { ...onTrack, lastSessionAt: daysBefore(5) };

    expect(mascotState(closedLongAgo, NO_DEVICE_SIGNALS, NOW)).toStrictEqual({
      mood: 'nudging',
      reason: 'absence',
      daysSinceLastSession: 5,
    });
  });
});

describe('mascotState — prioridad cuando coinciden varios estados', () => {
  const everything: MascotTrainingSignals = {
    lastSessionAt: daysBefore(SLEEPY_AFTER_DAYS),
    activeSessionId: SESSION_ID,
    latestRecord: { achievedAt: secondsBefore(20) },
    stalled: [{ trackedExerciseId: BENCH_ID }],
  };

  it('la marca recién batida gana a todo, también al descanso', () => {
    expect(mascotState(everything, restingFor(20), NOW).mood).toBe('celebrating');
  });

  it('sin marca reciente, el descanso gana a la ausencia y al estancamiento', () => {
    const noRecord: MascotTrainingSignals = { ...everything, latestRecord: null };

    expect(mascotState(noRecord, restingFor(20), NOW).mood).toBe('resting');
  });

  it('con la sesión abierta se anima aunque haya estancamientos: se está entrenando', () => {
    const stalledAtTheGym: MascotTrainingSignals = {
      ...atTheGym,
      stalled: [{ trackedExerciseId: BENCH_ID }],
    };

    expect(mascotState(stalledAtTheGym, NO_DEVICE_SIGNALS, NOW).mood).toBe('cheering');
  });

  it('sin sesión, una semana fuera duerme a la mascota aunque haya estancamientos', () => {
    const awayAndStalled: MascotTrainingSignals = {
      ...everything,
      activeSessionId: null,
      latestRecord: null,
    };

    expect(mascotState(awayAndStalled, NO_DEVICE_SIGNALS, NOW).mood).toBe('sleepy');
  });

  it('la ausencia empuja antes que el estancamiento: primero hay que volver', () => {
    const awayAndStalled: MascotTrainingSignals = {
      ...onTrack,
      lastSessionAt: daysBefore(NUDGE_AFTER_DAYS),
      stalled: [{ trackedExerciseId: BENCH_ID }],
    };

    expect(mascotState(awayAndStalled, NO_DEVICE_SIGNALS, NOW)).toStrictEqual({
      mood: 'nudging',
      reason: 'absence',
      daysSinceLastSession: NUDGE_AFTER_DAYS,
    });
  });
});

describe('mascotState — entrada', () => {
  it('acepta la respuesta de GET /stats/signals tal cual, sin adaptarla', () => {
    const signals = trainingSignalsSchema.parse({
      generatedAt: NOW.toISOString(),
      lastSessionAt: daysBefore(2),
      daysSinceLastSession: 2,
      weeklyStreak: 3,
      sessionsThisWeek: 1,
      activeSessionId: null,
      latestRecord: {
        id: '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b',
        trackedExerciseId: BENCH_ID,
        kind: 'max_weight',
        value: '82.50',
        setEntryId: '4f5a6b7c-8d9e-4f0a-9b2c-3d4e5f6a7b8c',
        achievedAt: daysBefore(2),
      },
      stalled: [
        {
          trackedExerciseId: BENCH_ID,
          weight: '82.50',
          sessions: 3,
          suggestedIncrement: '2.50',
        },
      ],
    });

    expect(mascotState(signals, NO_DEVICE_SIGNALS, NOW)).toStrictEqual({
      mood: 'nudging',
      reason: 'stagnation',
      stalledExerciseIds: [BENCH_ID],
    });
  });

  it('usa el instante que recibe y no el reloj: los días se cuentan hasta `now`', () => {
    const later = new Date(NOW.getTime() + NUDGE_AFTER_DAYS * 86_400_000);

    expect(mascotState(onTrack, NO_DEVICE_SIGNALS, NOW).mood).toBe('idle');
    expect(mascotState(onTrack, NO_DEVICE_SIGNALS, later)).toStrictEqual({
      mood: 'nudging',
      reason: 'absence',
      daysSinceLastSession: NUDGE_AFTER_DAYS + 1,
    });
  });
});
