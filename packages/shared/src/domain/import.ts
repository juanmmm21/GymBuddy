import type {
  ExportFile,
  ExportedExercise,
  ExportedRoutine,
  ExportedSession,
} from '../schemas/export';

/*
 * Importar una copia de seguridad. En la base los identificadores son claves primarias
 * globales, no por usuario, así que reutilizar los del fichero chocaría con las filas de la
 * cuenta que lo exportó si sigue existiendo, que es justo el caso que motiva importar: perder
 * los móviles y abrir una cuenta nueva. Cada id se deriva del usuario de destino y del id del
 * fichero, de forma determinista: en otra cuenta sale otro id, y en la misma cuenta sale
 * siempre el mismo, que es lo que hace que importar dos veces o reanudar a medias no duplique.
 */

/** Ejercicios por petición: cada uno cuesta dos parámetros en las comprobaciones de D1. */
export const MAX_IMPORT_EXERCISES_PER_BATCH = 50;

/** Rutinas por petición. Las líneas cuentan aparte, en el tope de filas. */
export const MAX_IMPORT_ROUTINES_PER_BATCH = 10;

/** Sesiones por petición. Sus series y marcas cuentan aparte, en el tope de filas. */
export const MAX_IMPORT_SESSIONS_PER_BATCH = 20;

/**
 * Filas que escribe una petición de rutinas o de sesiones. Con 10 ms de CPU por invocación, lo
 * que cuesta es validar el cuerpo y derivar un id por fila: medido en local, doscientas cincuenta
 * filas se llevaban unos 5,5 ms en frío antes de armar ninguna sentencia, sin margen para un
 * servidor más lento. Ciento cincuenta dejan la mitad libre, y una sesión normal no pasa de cincuenta.
 */
export const MAX_IMPORT_ROWS_PER_BATCH = 150;

const IMPORT_ID_NAMESPACE = 'gymbuddy-import';

/**
 * El id que recibe en la cuenta `userId` la fila que en el fichero se llamaba `originalId`. Es un
 * UUID de versión 8 (RFC 9562, «a medida») hecho con los primeros bytes de un SHA-256: no se
 * puede elegir a propósito el id de destino de otra cuenta sin conocer su usuario.
 */
export async function deriveImportedId(userId: string, originalId: string): Promise<string> {
  // Los dos ids son UUID, así que la barra no puede aparecer dentro y el separador no es ambiguo.
  const payload = new TextEncoder().encode(`${IMPORT_ID_NAMESPACE}|${userId}|${originalId}`);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', payload)).slice(0, 16);

  // Los bits de versión y de variante son los que hacen de estos bytes un UUID válido.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Deriva de una vez los ids de muchas filas; los repetidos se calculan una sola vez. */
export async function deriveImportedIds(
  userId: string,
  originalIds: Iterable<string>,
): Promise<Map<string, string>> {
  const unique = [...new Set(originalIds)];
  const derived = await Promise.all(unique.map((id) => deriveImportedId(userId, id)));

  return new Map(unique.map((id, index) => [id, derived[index] ?? id]));
}

/** El id derivado de uno que tiene que estar en el mapa: si falta, es un fallo de quien llama. */
export function importedIdOf(importedIds: ReadonlyMap<string, string>, originalId: string): string {
  const derived = importedIds.get(originalId);
  if (derived === undefined) {
    throw new Error(`Falta el id importado de ${originalId}`);
  }

  return derived;
}

/** Filas que escribe una rutina: ella y sus líneas. */
export function routineImportRows(routine: Pick<ExportedRoutine, 'items'>): number {
  return 1 + routine.items.length;
}

/** Filas que escribe una sesión: ella, sus series y las marcas de cada serie. */
export function sessionImportRows(session: Pick<ExportedSession, 'sets'>): number {
  return session.sets.reduce((rows, set) => rows + 1 + set.records.length, 1);
}

/**
 * Cuándo termina una sesión importada. Una que en el fichero sigue abierta se importa cerrada a
 * la hora de su última serie —o a la de su comienzo, si no tiene ninguna—: una cuenta solo puede
 * tener una sesión abierta, y un entrenamiento de un móvil perdido no se va a continuar.
 *
 * Se comparan instantes y no texto: una fecha con otro desfase se ordenaría mal como cadena.
 */
export function importedSessionEndedAt(
  session: Pick<ExportedSession, 'startedAt' | 'endedAt' | 'sets'>,
): string {
  if (session.endedAt !== null) return session.endedAt;

  let latest = session.startedAt;
  for (const set of session.sets) {
    if (Date.parse(set.completedAt) > Date.parse(latest)) latest = set.completedAt;
  }

  return latest;
}

/** Algo del fichero que no cabe en ninguna petición por sí solo. */
export interface OversizedImportEntry {
  readonly kind: 'routine' | 'session';
  readonly id: string;
  readonly rows: number;
}

/**
 * Las peticiones en las que se sube un fichero, en el orden en que tienen que ir: los ejercicios
 * primero, porque las líneas de rutina y las series los nombran.
 */
export interface ImportPlan {
  readonly exercises: readonly (readonly ExportedExercise[])[];
  readonly routines: readonly (readonly ExportedRoutine[])[];
  readonly sessions: readonly (readonly ExportedSession[])[];
  /** Si no está vacío, el fichero no se puede importar entero y no debe empezarse. */
  readonly oversized: readonly OversizedImportEntry[];
}

export function planImport(
  file: Pick<ExportFile, 'exercises' | 'routines' | 'sessions'>,
): ImportPlan {
  const exercises = packImportBatches(file.exercises, () => 1, MAX_IMPORT_EXERCISES_PER_BATCH);
  const routines = packImportBatches(
    file.routines,
    routineImportRows,
    MAX_IMPORT_ROUTINES_PER_BATCH,
  );
  const sessions = packImportBatches(
    file.sessions,
    sessionImportRows,
    MAX_IMPORT_SESSIONS_PER_BATCH,
  );

  return {
    exercises: exercises.batches,
    routines: routines.batches,
    sessions: sessions.batches,
    oversized: [
      ...routines.oversized.map(({ entry, rows }) => ({
        kind: 'routine' as const,
        id: entry.id,
        rows,
      })),
      ...sessions.oversized.map(({ entry, rows }) => ({
        kind: 'session' as const,
        id: entry.id,
        rows,
      })),
    ],
  };
}

interface PackedImportBatches<T> {
  readonly batches: T[][];
  readonly oversized: { readonly entry: T; readonly rows: number }[];
}

/**
 * Reparte en orden y sin reordenar: llena cada petición hasta que la siguiente entrada pasaría del
 * tope de entradas o del de filas. Lo que por sí solo pasa del tope de filas no entra en ninguna.
 */
function packImportBatches<T>(
  entries: readonly T[],
  rowsOf: (entry: T) => number,
  maxEntries: number,
): PackedImportBatches<T> {
  const packed: PackedImportBatches<T> = { batches: [], oversized: [] };
  let current: T[] = [];
  let currentRows = 0;

  for (const entry of entries) {
    const rows = rowsOf(entry);
    if (rows > MAX_IMPORT_ROWS_PER_BATCH) {
      packed.oversized.push({ entry, rows });
      continue;
    }

    if (current.length === maxEntries || currentRows + rows > MAX_IMPORT_ROWS_PER_BATCH) {
      packed.batches.push(current);
      current = [];
      currentRows = 0;
    }

    current.push(entry);
    currentRows += rows;
  }

  if (current.length > 0) packed.batches.push(current);

  return packed;
}

/** Lo mínimo de un ejercicio que ya tiene la cuenta de destino para buscar choques. */
export interface AccountExerciseRef {
  readonly id: string;
  readonly catalogId: string | null;
}

/**
 * Los ejercicios del catálogo del fichero que la cuenta ya sigue con otra ficha. La base no deja
 * seguir dos veces el mismo, así que importarlos exigiría fusionar dos historiales en uno. Una
 * ficha cuyo id es el derivado de la del fichero no choca: es la misma importación, reanudada.
 */
export function findCatalogConflicts(
  fileExercises: readonly Pick<ExportedExercise, 'id' | 'catalogId'>[],
  accountExercises: readonly AccountExerciseRef[],
  importedIds: ReadonlyMap<string, string>,
): string[] {
  const accountByCatalogId = new Map<string, string>();
  for (const exercise of accountExercises) {
    if (exercise.catalogId !== null) accountByCatalogId.set(exercise.catalogId, exercise.id);
  }

  const conflicts: string[] = [];
  for (const exercise of fileExercises) {
    if (exercise.catalogId === null) continue;

    const accountId = accountByCatalogId.get(exercise.catalogId);
    if (accountId !== undefined && accountId !== importedIds.get(exercise.id)) {
      conflicts.push(exercise.catalogId);
    }
  }

  return conflicts;
}
