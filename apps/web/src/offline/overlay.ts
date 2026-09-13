import type { ResourceId, SetEntry, WorkoutSessionDetail } from '@gymbuddy/shared';
import type { SessionWrite } from './pending-write';

/** La sesión abierta tal y como la ve quien entrena: lo que tiene el Worker más lo que espera en la cola. */
export interface SessionWithPendingWrites {
  readonly session: WorkoutSessionDetail | null;
  /** Series que se ven, o se ven corregidas, y que todavía no han llegado al Worker. */
  readonly pendingSetIds: ReadonlySet<ResourceId>;
}

/**
 * Aplica las escrituras pendientes, en su orden, sobre la sesión abierta del Worker. Sin esto,
 * una serie registrada sin cobertura desaparecería de la pantalla hasta que vuelva la red, y
 * quien entrena la registraría otra vez.
 *
 * Cada paso tolera que la escritura ya haya llegado —la cola la retira un instante después de
 * que el Worker la acepte, y la sesión se relee aparte—: una serie con un id que ya está no se
 * añade dos veces, y corregir, borrar o cerrar dan lo mismo aplicados sobre su propio resultado.
 */
export function applyPendingWrites(
  session: WorkoutSessionDetail | null,
  writes: readonly SessionWrite[],
): SessionWithPendingWrites {
  let current = session;
  const pendingSetIds = new Set<ResourceId>();

  for (const write of writes) {
    switch (write.kind) {
      case 'start_session':
        // Con otra sesión abierta el Worker rechazará esta al drenarla; mientras, manda la que hay.
        if (current === null) {
          current = {
            id: write.body.id,
            startedAt: write.body.startedAt,
            endedAt: null,
            notes: write.body.notes ?? null,
            sets: [],
          };
        }
        break;

      case 'log_set': {
        if (current?.id !== write.sessionId) break;
        const { body } = write;
        if (!current.sets.some((set) => set.id === body.id)) {
          const entry: SetEntry = {
            id: body.id,
            trackedExerciseId: body.trackedExerciseId,
            orderIndex: nextOrderIndex(current.sets),
            weight: body.weight,
            reps: body.reps,
            rpe: body.rpe ?? null,
            isWarmup: body.isWarmup ?? false,
            completedAt: body.completedAt,
          };
          current = { ...current, sets: [...current.sets, entry] };
        }
        pendingSetIds.add(body.id);
        break;
      }

      case 'update_set': {
        if (current?.id !== write.sessionId) break;
        const { setId, body } = write;
        if (!current.sets.some((set) => set.id === setId)) break;
        current = {
          ...current,
          sets: current.sets.map((set) => (set.id === setId ? correctedSet(set, body) : set)),
        };
        pendingSetIds.add(setId);
        break;
      }

      case 'remove_set': {
        if (current?.id !== write.sessionId) break;
        const { setId } = write;
        current = { ...current, sets: current.sets.filter((set) => set.id !== setId) };
        pendingSetIds.delete(setId);
        break;
      }

      case 'end_session':
        // Cerrada, deja de ser la sesión en curso aunque el Worker aún no lo sepa.
        if (current?.id === write.sessionId) current = null;
        break;
    }
  }

  return { session: current, pendingSetIds };
}

/** Una corrección parcial: lo que no viaja en la petición se queda como estaba. */
function correctedSet(
  set: SetEntry,
  body: Extract<SessionWrite, { kind: 'update_set' }>['body'],
): SetEntry {
  return {
    ...set,
    weight: body.weight ?? set.weight,
    reps: body.reps ?? set.reps,
    // `null` es quitar el RPE; ausente es no tocarlo.
    rpe: body.rpe === undefined ? set.rpe : body.rpe,
    isWarmup: body.isWarmup ?? set.isWarmup,
  };
}

/** Igual que la inserción del Worker: detrás de la última, sin rellenar huecos de borrados. */
function nextOrderIndex(sets: readonly SetEntry[]): number {
  return sets.reduce((max, set) => Math.max(max, set.orderIndex), -1) + 1;
}
