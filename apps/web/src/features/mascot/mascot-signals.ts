import type {
  MascotDeviceSignals,
  MascotTrainingSignals,
  PersonalRecord,
  StalledExercise,
  WorkoutSessionDetail,
} from '@gymbuddy/shared';

/**
 * Lo que la mascota lee del Worker, con el detalle de los estancados que necesita el
 * mensaje para nombrarlos. `TrainingSignals` ya lo cumple tal cual.
 */
export interface LiveMascotSignals extends MascotTrainingSignals {
  readonly stalled: readonly StalledExercise[];
}

/**
 * Las señales de la pantalla de la sesión, sacadas de la sesión abierta que ya pinta. No
 * se pide `GET /stats/signals` aquí: con una sesión abierta la mascota solo mira si la
 * sesión sigue abierta —celebrar, descansar y animar—, y eso lo dice ya
 * `GET /sessions/active`, que se invalida con las mismas escrituras. La ausencia, el sueño y
 * el estancamiento pierden siempre contra una sesión abierta, así que van vacíos.
 */
export function openSessionSignals(
  session: Pick<WorkoutSessionDetail, 'id' | 'startedAt'>,
): LiveMascotSignals {
  return {
    lastSessionAt: session.startedAt,
    activeSessionId: session.id,
    latestRecord: null,
    stalled: [],
  };
}

/**
 * Lo que sabe la pantalla de la sesión: el descanso cuenta desde la última serie con el
 * objetivo elegido, igual que el temporizador, y las marcas son las que han devuelto los
 * registros y correcciones de esta visita.
 */
export function sessionDeviceSignals(
  lastSetAt: string | null,
  restTargetSeconds: number,
  records: readonly PersonalRecord[],
): MascotDeviceSignals {
  return {
    rest: lastSetAt === null ? null : { lastSetAt, targetSeconds: restTargetSeconds },
    freshRecords: records,
  };
}
