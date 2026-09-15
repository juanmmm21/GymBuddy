import {
  endsCardioInProgress,
  idleSessionEndAt,
  type ResourceId,
  type SetEntry,
  type WorkoutSessionDetail,
} from '@gymbuddy/shared';
import type { SessionWrite } from './pending-write';

/** La sesión abierta tal y como la ve quien entrena: lo que tiene el Worker más lo que espera en la cola. */
export interface SessionWithPendingWrites {
  readonly session: WorkoutSessionDetail | null;
  /** Series que se ven, o se ven corregidas, y que todavía no han llegado al Worker. */
  readonly pendingSetIds: ReadonlySet<ResourceId>;
}

/**
 * La sesión deja de estar en curso si lleva una hora sin actividad (ADR 0008), contando las
 * series que esperan en la cola y sin contar el tiempo de un cardio en marcha. Es la misma regla con la que el Worker la cierra, aplicada en el
 * móvil: sin cobertura el Worker no puede avisar, y quien vuelve tras un rato largo tiene que ver
 * «Empezar» y no una sesión en la que su siguiente serie ya no entraría. Lo encolado de esa sesión
 * sigue en la cola y llega igual: el Worker la reabre si continúa su actividad.
 */
export function withoutIdleSession(
  current: SessionWithPendingWrites,
  now: Date,
): SessionWithPendingWrites {
  const { session } = current;
  if (session === null || session.endedAt !== null) return current;

  const endedAt = idleSessionEndAt(
    {
      startedAt: session.startedAt,
      setCompletedAts: session.sets.map((set) => set.completedAt),
      cardioStartedAt: session.cardioStartedAt,
    },
    now,
  );

  return endedAt === null ? current : { session: null, pendingSetIds: new Set() };
}

/**
 * Si algo de esa sesión espera todavía en la cola. Borrarla entonces dejaría lo encolado
 * rechazándose una escritura detrás de otra al drenar, cada una con su aviso.
 */
export function hasPendingWritesForSession(
  writes: readonly SessionWrite[],
  sessionId: ResourceId,
): boolean {
  return writes.some((write) =>
    write.kind === 'start_session' ? write.body.id === sessionId : write.sessionId === sessionId,
  );
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
            cardioStartedAt: null,
          };
        }
        break;

      case 'log_set': {
        if (current?.id !== write.sessionId) break;
        const { body } = write;
        if (!current.sets.some((set) => set.id === body.id)) {
          const base = {
            id: body.id,
            trackedExerciseId: body.trackedExerciseId,
            orderIndex: nextOrderIndex(current.sets),
            rpe: body.rpe ?? null,
            isWarmup: body.isWarmup ?? false,
            completedAt: body.completedAt,
          };
          const entry: SetEntry =
            body.kind === 'cardio'
              ? {
                  ...base,
                  kind: 'cardio',
                  durationSeconds: body.durationSeconds,
                  distanceMeters: body.distanceMeters ?? null,
                }
              : { ...base, kind: 'strength', weight: body.weight, reps: body.reps };
          current = { ...current, sets: [...current.sets, entry] };
          // Igual que en el Worker: apuntar el cardio termina el que estaba en marcha.
          if (
            entry.kind === 'cardio' &&
            current.cardioStartedAt !== null &&
            current.cardioStartedAt !== undefined &&
            endsCardioInProgress(current.cardioStartedAt, entry.completedAt)
          ) {
            current = { ...current, cardioStartedAt: null };
          }
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

      case 'start_cardio':
        if (current?.id === write.sessionId) {
          current = { ...current, cardioStartedAt: write.body.startedAt };
        }
        break;

      case 'cancel_cardio':
        if (current?.id === write.sessionId) current = { ...current, cardioStartedAt: null };
        break;

      case 'end_session':
        // Cerrada, deja de ser la sesión en curso aunque el Worker aún no lo sepa.
        if (current?.id === write.sessionId) current = null;
        break;
    }
  }

  return { session: current, pendingSetIds };
}

/**
 * Una corrección parcial: lo que no viaja en la petición se queda como estaba. Los campos del otro
 * tipo se ignoran: el Worker rechazará esa corrección, y hasta entonces la serie sigue siendo lo que era.
 */
function correctedSet(
  set: SetEntry,
  body: Extract<SessionWrite, { kind: 'update_set' }>['body'],
): SetEntry {
  const common = {
    // `null` es quitar el RPE; ausente es no tocarlo.
    rpe: body.rpe === undefined ? set.rpe : body.rpe,
    isWarmup: body.isWarmup ?? set.isWarmup,
  };

  if (set.kind === 'cardio') {
    return {
      ...set,
      ...common,
      durationSeconds: body.durationSeconds ?? set.durationSeconds,
      // `null` es quitar la distancia; ausente es no tocarla.
      distanceMeters: body.distanceMeters === undefined ? set.distanceMeters : body.distanceMeters,
    };
  }

  return {
    ...set,
    ...common,
    weight: body.weight ?? set.weight,
    reps: body.reps ?? set.reps,
  };
}

/** Igual que la inserción del Worker: detrás de la última, sin rellenar huecos de borrados. */
function nextOrderIndex(sets: readonly SetEntry[]): number {
  return sets.reduce((max, set) => Math.max(max, set.orderIndex), -1) + 1;
}
