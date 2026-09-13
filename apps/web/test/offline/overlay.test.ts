import type { SetEntry, WorkoutSessionDetail } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import { applyPendingWrites } from '../../src/offline/overlay';
import type { SessionWrite } from '../../src/offline/pending-write';
import { activeSession, benchPress, squat } from '../fixtures';

const OPEN_ID = activeSession.id;
const LOGGED_SET = firstLoggedSet();
const NEW_SESSION_ID = '2b6c0d8e-1f3a-4b5c-8d7e-9f0a1b2c3d4e';
const QUEUED_SET_ID = '3c7d1e9f-2a4b-4c6d-9e8f-0a1b2c3d4e5f';
const OTHER_SET_ID = '4d8e2f0a-3b5c-4d7e-8f9a-1b2c3d4e5f60';

function logSet(
  id: string,
  overrides: Partial<Extract<SessionWrite, { kind: 'log_set' }>['body']> = {},
  sessionId = OPEN_ID,
): SessionWrite {
  return {
    kind: 'log_set',
    sessionId,
    body: {
      id,
      trackedExerciseId: squat.id,
      weight: '100.00',
      reps: 5,
      completedAt: '2026-09-08T18:30:00.000Z',
      ...overrides,
    },
  };
}

function firstLoggedSet(): SetEntry {
  const [set] = activeSession.sets;
  if (set === undefined)
    throw new Error('La fixture de la sesión abierta tiene que traer una serie');
  return set;
}

describe('applyPendingWrites', () => {
  it('sin nada pendiente devuelve la sesión del Worker tal cual', () => {
    const view = applyPendingWrites(activeSession, []);

    expect(view.session).toBe(activeSession);
    expect(view.pendingSetIds.size).toBe(0);
  });

  it('una serie encolada aparece detrás de las guardadas y se marca pendiente', () => {
    const view = applyPendingWrites(activeSession, [logSet(QUEUED_SET_ID, { rpe: 8.5 })]);

    expect(view.session?.sets.map((set) => set.id)).toEqual([LOGGED_SET.id, QUEUED_SET_ID]);
    expect(view.session?.sets[1]).toEqual({
      id: QUEUED_SET_ID,
      trackedExerciseId: squat.id,
      orderIndex: 1,
      weight: '100.00',
      reps: 5,
      rpe: 8.5,
      isWarmup: false,
      completedAt: '2026-09-08T18:30:00.000Z',
    });
    expect([...view.pendingSetIds]).toEqual([QUEUED_SET_ID]);
  });

  it('no duplica una serie que el Worker ya devuelve aunque siga en la cola', () => {
    const arrived: WorkoutSessionDetail = {
      ...activeSession,
      sets: [...activeSession.sets, { ...LOGGED_SET, id: QUEUED_SET_ID, orderIndex: 1 }],
    };

    const view = applyPendingWrites(arrived, [logSet(QUEUED_SET_ID)]);

    expect(view.session?.sets).toHaveLength(2);
  });

  it('el orden sigue a la última posición aunque un borrado haya dejado hueco', () => {
    const withGap: WorkoutSessionDetail = {
      ...activeSession,
      sets: [{ ...LOGGED_SET, orderIndex: 4 }],
    };

    const view = applyPendingWrites(withGap, [logSet(QUEUED_SET_ID)]);

    expect(view.session?.sets[1]?.orderIndex).toBe(5);
  });

  it('abrir sin red crea la sesión con la hora en que se pulsó y recibe sus series', () => {
    const view = applyPendingWrites(null, [
      {
        kind: 'start_session',
        body: { id: NEW_SESSION_ID, startedAt: '2026-09-08T19:00:00.000Z' },
      },
      logSet(QUEUED_SET_ID, {}, NEW_SESSION_ID),
    ]);

    expect(view.session).toMatchObject({
      id: NEW_SESSION_ID,
      startedAt: '2026-09-08T19:00:00.000Z',
      endedAt: null,
      notes: null,
    });
    expect(view.session?.sets.map((set) => set.id)).toEqual([QUEUED_SET_ID]);
  });

  it('con otra sesión abierta en el Worker manda la que hay y no pinta series ajenas a ella', () => {
    const view = applyPendingWrites(activeSession, [
      {
        kind: 'start_session',
        body: { id: NEW_SESSION_ID, startedAt: '2026-09-08T19:00:00.000Z' },
      },
      logSet(QUEUED_SET_ID, {}, NEW_SESSION_ID),
    ]);

    expect(view.session?.id).toBe(OPEN_ID);
    expect(view.session?.sets).toHaveLength(1);
    expect(view.pendingSetIds.size).toBe(0);
  });

  it('corregir pendiente cambia solo lo que viaja y distingue quitar el RPE de no tocarlo', () => {
    const rated: WorkoutSessionDetail = {
      ...activeSession,
      sets: [{ ...LOGGED_SET, rpe: 9 }],
    };
    const setId = LOGGED_SET.id;

    const untouched = applyPendingWrites(rated, [
      { kind: 'update_set', sessionId: OPEN_ID, setId, body: { reps: 6 } },
    ]);
    expect(untouched.session?.sets[0]).toMatchObject({ weight: '82.50', reps: 6, rpe: 9 });
    expect([...untouched.pendingSetIds]).toEqual([setId]);

    const cleared = applyPendingWrites(rated, [
      { kind: 'update_set', sessionId: OPEN_ID, setId, body: { rpe: null } },
    ]);
    expect(cleared.session?.sets[0]?.rpe).toBeNull();
  });

  it('corregir una serie que no está no inventa nada', () => {
    const view = applyPendingWrites(activeSession, [
      { kind: 'update_set', sessionId: OPEN_ID, setId: OTHER_SET_ID, body: { reps: 6 } },
    ]);

    expect(view.session?.sets).toEqual(activeSession.sets);
    expect(view.pendingSetIds.size).toBe(0);
  });

  it('borrar una serie encolada la quita de la pantalla y de las pendientes', () => {
    const view = applyPendingWrites(activeSession, [
      logSet(QUEUED_SET_ID),
      { kind: 'remove_set', sessionId: OPEN_ID, setId: QUEUED_SET_ID },
      { kind: 'remove_set', sessionId: OPEN_ID, setId: LOGGED_SET.id },
    ]);

    expect(view.session?.sets).toEqual([]);
    expect(view.pendingSetIds.size).toBe(0);
  });

  it('cerrar sin red deja de mostrar la sesión en curso', () => {
    const view = applyPendingWrites(activeSession, [
      logSet(QUEUED_SET_ID),
      {
        kind: 'end_session',
        sessionId: OPEN_ID,
        body: { endedAt: '2026-09-08T19:30:00.000Z', notes: null },
      },
    ]);

    expect(view.session).toBeNull();
  });

  it('lo de una sesión que no es la abierta se ignora', () => {
    const view = applyPendingWrites(activeSession, [
      logSet(QUEUED_SET_ID, { trackedExerciseId: benchPress.id }, NEW_SESSION_ID),
      {
        kind: 'end_session',
        sessionId: NEW_SESSION_ID,
        body: { endedAt: '2026-09-08T19:30:00.000Z' },
      },
    ]);

    expect(view.session).toBe(activeSession);
  });
});
