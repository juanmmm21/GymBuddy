import {
  MASCOT_MOODS,
  NO_DEVICE_SIGNALS,
  mascotState,
  type MascotState,
  type StalledExercise,
} from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import { MASCOT_MOOD_LABELS } from '../../src/features/mascot/labels';
import {
  MAX_NAMED_STALLED_EXERCISES,
  mascotMessage,
  stalledMentions,
  type MascotMessageContext,
  type StalledExerciseMention,
} from '../../src/features/mascot/messages';
import { openSessionSignals, sessionDeviceSignals } from '../../src/features/mascot/mascot-signals';
import { MASCOT_POSES } from '../../src/features/mascot/poses';
import { activeSession, benchPress, customCurl, newMaxWeightRecord, squat } from '../fixtures';

/** Viernes 11 de septiembre de 2026 por la noche: las fechas de los mensajes cuelgan de aquí. */
const NOW = new Date('2026-09-11T20:00:00.000Z');

const NO_STALLED: MascotMessageContext = { locale: 'es', now: NOW, stalled: [] };

const benchMention: StalledExerciseMention = { name: 'Press de banca', suggestedIncrement: '2.50' };
const squatMention: StalledExerciseMention = { name: 'Sentadilla', suggestedIncrement: '5.00' };
const curlMention: StalledExerciseMention = { name: 'Curl', suggestedIncrement: '2.50' };

function stagnation(count: number): MascotState {
  return {
    mood: 'nudging',
    reason: 'stagnation',
    stalledExerciseIds: Array.from({ length: count }, (_, index) => `id-${String(index)}`),
  };
}

function stalledEntry(trackedExerciseId: string, suggestedIncrement: string): StalledExercise {
  return { trackedExerciseId, weight: '80.00', sessions: 3, suggestedIncrement };
}

describe('mascotMessage', () => {
  it('celebra una marca', () => {
    const message = mascotMessage(
      { mood: 'celebrating', recordAchievedAt: '2026-09-11T10:00:00Z' },
      NO_STALLED,
    );
    expect(message.title).toBe('¡Récord!');
  });

  it('en el descanso dice lo que queda con el mismo formato que el temporizador', () => {
    expect(mascotMessage({ mood: 'resting', remainingSeconds: 45 }, NO_STALLED).body).toContain(
      'Quedan 0:45 de descanso',
    );
    expect(mascotMessage({ mood: 'resting', remainingSeconds: 90 }, NO_STALLED).body).toContain(
      'Quedan 1:30 de descanso',
    );
  });

  it('anima distinto al abrir la sesión que al cumplir el descanso', () => {
    const started = mascotMessage({ mood: 'cheering', reason: 'session_started' }, NO_STALLED);
    const restOver = mascotMessage({ mood: 'cheering', reason: 'rest_over' }, NO_STALLED);

    expect(started.title).toBe('¡Al lío!');
    expect(restOver.title).toBe('¿Seguimos?');
    expect(restOver.body).toContain('Ya has descansado');
  });

  it('dormido cuenta los días sin vernos', () => {
    const message = mascotMessage({ mood: 'sleepy', daysSinceLastSession: 9 }, NO_STALLED);
    expect(message.body).toMatch(/^9 días sin vernos/);
  });

  it('por ausencia dice cuándo fue la última sin reprochar', () => {
    const message = mascotMessage(
      { mood: 'nudging', reason: 'absence', daysSinceLastSession: 5 },
      NO_STALLED,
    );
    expect(message.title).toBe('¿Hoy toca?');
    expect(message.body).toContain('La última fue hace 5 días.');
  });

  it('la sesión olvidada dice cuándo se abrió y cómo cerrarla', () => {
    const message = mascotMessage(
      { mood: 'nudging', reason: 'forgotten_session', openedAt: '2026-09-08T16:30:00.000Z' },
      NO_STALLED,
    );

    expect(message.title).toBe('Te dejaste la sesión abierta');
    expect(message.body).toMatch(/^La abriste el mar, 8 sept a las \d\d:30\./);
    expect(message.body).toContain('«Terminar sesión»');
  });

  it('distingue a quien no ha entrenado nunca de quien va al día', () => {
    expect(mascotMessage({ mood: 'idle', reason: 'never_trained' }, NO_STALLED).body).toContain(
      'primera sesión',
    );
    expect(mascotMessage({ mood: 'idle', reason: 'on_track' }, NO_STALLED).title).toBe(
      'Todo en orden',
    );
  });

  it('todos los estados tienen algo que decir', () => {
    const states: MascotState[] = [
      { mood: 'celebrating', recordAchievedAt: '2026-09-11T10:00:00Z' },
      { mood: 'resting', remainingSeconds: 1 },
      { mood: 'cheering', reason: 'session_started' },
      { mood: 'cheering', reason: 'rest_over' },
      { mood: 'sleepy', daysSinceLastSession: 7 },
      { mood: 'nudging', reason: 'absence', daysSinceLastSession: 4 },
      { mood: 'nudging', reason: 'forgotten_session', openedAt: '2026-09-08T18:00:00.000Z' },
      stagnation(1),
      { mood: 'idle', reason: 'never_trained' },
      { mood: 'idle', reason: 'on_track' },
    ];

    for (const state of states) {
      const message = mascotMessage(state, NO_STALLED);
      expect(message.title.length).toBeGreaterThan(0);
      expect(message.body.length).toBeGreaterThan(0);
    }
  });
});

describe('mascotMessage: estancamiento', () => {
  it('con uno solo lo nombra y sugiere su incremento con la coma del idioma', () => {
    const message = mascotMessage(stagnation(1), {
      locale: 'es',
      now: NOW,
      stalled: [benchMention],
    });

    expect(message.title).toBe('Toca subir en Press de banca');
    expect(message.body).toContain('Prueba con +2,5 kg');
  });

  it('en inglés el incremento lleva punto', () => {
    const message = mascotMessage(stagnation(1), {
      locale: 'en',
      now: NOW,
      stalled: [benchMention],
    });
    expect(message.body).toContain('+2.5 kg');
  });

  it('con dos los enumera con su incremento', () => {
    const message = mascotMessage(stagnation(2), {
      locale: 'es',
      now: NOW,
      stalled: [benchMention, squatMention],
    });

    expect(message.title).toBe('Toca subir peso');
    expect(message.body).toMatch(/^Press de banca \(\+2,5 kg\) y Sentadilla \(\+5 kg\) te lo/);
  });

  it(`nombra como mucho ${String(MAX_NAMED_STALLED_EXERCISES)} y cuenta el resto`, () => {
    const message = mascotMessage(stagnation(4), {
      locale: 'es',
      now: NOW,
      stalled: [benchMention, squatMention, curlMention],
    });

    expect(message.body).toMatch(
      /^Press de banca \(\+2,5 kg\), Sentadilla \(\+5 kg\) y 2 más te lo/,
    );
    expect(message.body).not.toContain('Curl');
  });

  it('sin nombres todavía habla de ellos sin inventarse ninguno', () => {
    const message = mascotMessage(stagnation(2), NO_STALLED);

    expect(message.title).toBe('Toca subir peso');
    expect(message.body).toContain('Hay ejercicios');
  });

  it('con un nombre de dos estancados no finge que solo hay uno', () => {
    const message = mascotMessage(stagnation(2), {
      locale: 'es',
      now: NOW,
      stalled: [benchMention],
    });

    expect(message.title).toBe('Toca subir peso');
    expect(message.body).toMatch(/^Press de banca \(\+2,5 kg\) y 1 más te lo/);
  });
});

describe('stalledMentions', () => {
  const stalled = [stalledEntry(squat.id, '5.00'), stalledEntry(benchPress.id, '2.50')];

  it('empareja cada id con su nombre y su incremento, en el orden del estado', () => {
    expect(stalledMentions([benchPress.id, squat.id], stalled, [squat, benchPress])).toEqual([
      { name: 'Press de banca', suggestedIncrement: '2.50' },
      { name: squat.name, suggestedIncrement: '5.00' },
    ]);
  });

  it('deja fuera lo que no tiene nombre o no tiene incremento', () => {
    expect(stalledMentions([benchPress.id, squat.id], stalled, [benchPress])).toEqual([
      { name: 'Press de banca', suggestedIncrement: '2.50' },
    ]);
    expect(stalledMentions([customCurl.id], stalled, [customCurl])).toEqual([]);
  });

  it('sin estancados no hay nada que nombrar', () => {
    expect(stalledMentions([], stalled, [benchPress, squat])).toEqual([]);
  });
});

describe('poses y etiquetas', () => {
  it.each(MASCOT_MOODS)('%s tiene pose con cara y extremidades, y su descripción', (mood) => {
    const pose = MASCOT_POSES[mood];

    expect(pose.face.length).toBeGreaterThanOrEqual(3);
    expect(pose.limbs.length + (pose.wavingArm === null ? 0 : 1)).toBe(4);
    expect(MASCOT_MOOD_LABELS[mood]).toMatch(/^Tu compañero, /);
  });

  it('cada pose es distinta de las demás', () => {
    const drawings = MASCOT_MOODS.map((mood) => JSON.stringify(MASCOT_POSES[mood]));
    expect(new Set(drawings).size).toBe(MASCOT_MOODS.length);
  });

  it('las claves de React de cada grupo de trazos no se repiten', () => {
    for (const mood of MASCOT_MOODS) {
      const pose = MASCOT_POSES[mood];
      expect(new Set(pose.face).size).toBe(pose.face.length);
      expect(new Set(pose.limbs).size).toBe(pose.limbs.length);
      expect(new Set(pose.accents.map((accent) => accent.d)).size).toBe(pose.accents.length);
    }
  });
});

describe('señales de la pantalla de la sesión', () => {
  const lastSetAt = '2026-09-08T18:10:00.000Z';

  it('la sesión abierta cuenta como abierta y no arrastra ausencias ni estancados', () => {
    expect(openSessionSignals(activeSession)).toEqual({
      lastSessionAt: activeSession.startedAt,
      activeSessionId: activeSession.id,
      latestRecord: null,
      stalled: [],
    });
  });

  it('sin series no hay descanso: la mascota anima a empezar', () => {
    const device = sessionDeviceSignals(null, 120, []);

    expect(device).toEqual(NO_DEVICE_SIGNALS);
    expect(mascotState(openSessionSignals(activeSession), device, new Date(lastSetAt))).toEqual({
      mood: 'cheering',
      reason: 'session_started',
    });
  });

  it('el descanso cuenta desde la última serie con el objetivo elegido', () => {
    const device = sessionDeviceSignals(lastSetAt, 90, []);
    const thirtySecondsLater = new Date(Date.parse(lastSetAt) + 30_000);

    expect(mascotState(openSessionSignals(activeSession), device, thirtySecondsLater)).toEqual({
      mood: 'resting',
      remainingSeconds: 60,
    });
  });

  it('una marca devuelta por el registro se celebra por encima del descanso', () => {
    // La serie que batió la marca abre también el descanso: coinciden los dos estados.
    const device = sessionDeviceSignals(newMaxWeightRecord.achievedAt, 120, [newMaxWeightRecord]);
    const justAfter = new Date(Date.parse(newMaxWeightRecord.achievedAt) + 5_000);

    expect(mascotState(openSessionSignals(activeSession), device, justAfter)).toEqual({
      mood: 'celebrating',
      recordAchievedAt: newMaxWeightRecord.achievedAt,
    });
  });
});
