import {
  activeSessionResponseSchema,
  isoDatetimeSchema,
  resourceIdSchema,
  trainingSignalsSchema,
  weeklyCalendarSchema,
  type ResourceId,
} from '@gymbuddy/shared';
import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { z } from 'zod';
import { routineListSchema, trackedExerciseListSchema } from '../api/endpoints';
import { queryKeys } from '../api/queries';
import type { StorageLike } from '../lib/storage';

/**
 * Una lectura del Worker que se guarda en el dispositivo para poder abrir la app sin red. El
 * esquema es el de la respuesta: lo guardado lo escribió quizá otra versión de la PWA y se valida
 * igual que si llegase del Worker.
 */
interface SnapshotEntry {
  readonly name: string;
  readonly queryKey: QueryKey;
  readonly schema: z.ZodType;
}

/**
 * Lo justo para entrenar sin cobertura desde un arranque en frío: Hoy (señales, semana y rutinas
 * para empezar), la sesión abierta y los ejercicios con los archivados, que es la clave con la
 * que la sesión nombra sus series. El catálogo y el historial no: pesan más y no hacen falta en
 * mitad de una serie.
 */
export const SNAPSHOT_ENTRIES: readonly SnapshotEntry[] = [
  {
    name: 'active-session',
    queryKey: queryKeys.sessions.active,
    schema: activeSessionResponseSchema,
  },
  {
    name: 'tracked-exercises',
    queryKey: queryKeys.exercises.list({ includeArchived: true }),
    schema: trackedExerciseListSchema,
  },
  {
    name: 'routines',
    queryKey: queryKeys.routines.list({ includeArchived: true }),
    schema: routineListSchema,
  },
  { name: 'training-signals', queryKey: queryKeys.stats.signals, schema: trainingSignalsSchema },
  { name: 'weekly-calendar', queryKey: queryKeys.stats.week, schema: weeklyCalendarSchema },
];

const SNAPSHOT_KEY_PREFIX = 'gymbuddy.snapshot.';

export function snapshotStorageKey(entry: SnapshotEntry): string {
  return `${SNAPSHOT_KEY_PREFIX}${entry.name}`;
}

/**
 * Lo que se guarda por cada lectura. `userId` la ata a la cuenta —si en el mismo móvil entra otra
 * persona, no ve lo de la anterior— y `savedAt` es cuándo respondió el Worker, que se devuelve a
 * la caché para que la pantalla sepa que es viejo y lo relea en cuanto pueda.
 */
const storedSnapshotSchema = z.object({
  userId: resourceIdSchema,
  savedAt: isoDatetimeSchema,
  data: z.unknown(),
});

/**
 * Mete en la caché lo guardado de esa cuenta. Va antes del primer pintado: sin red, una consulta
 * sin datos se queda en el spinner o en el error, y la sesión abierta no se vería. Lo que la caché
 * ya tenga no se pisa, porque siempre es más nuevo que el disco. Devuelve cuántas lecturas entraron.
 */
export function restoreDeviceSnapshot(
  queryClient: QueryClient,
  storage: StorageLike,
  userId: ResourceId,
): number {
  let restored = 0;

  for (const entry of SNAPSHOT_ENTRIES) {
    if (queryClient.getQueryData(entry.queryKey) !== undefined) continue;

    const stored = readEntry(storage, entry);
    if (stored === null) continue;
    if (stored.userId !== userId) {
      // De otra cuenta: no se enseña, y se retira para no dejar sus datos en el móvil.
      removeEntry(storage, entry);
      continue;
    }

    queryClient.setQueryData(entry.queryKey, stored.data, {
      updatedAt: Date.parse(stored.savedAt),
    });
    restored += 1;
  }

  return restored;
}

/**
 * Guarda cada respuesta buena de esas lecturas mientras la cuenta tenga sesión. Es una suscripción
 * a la caché y no un paso más de cada `queryFn`: así también entra lo que se relee tras una
 * escritura, sin que ninguna pantalla tenga que acordarse. Devuelve cómo dejar de guardar.
 */
export function persistDeviceSnapshot(
  queryClient: QueryClient,
  storage: StorageLike,
  userId: ResourceId,
): () => void {
  const byHash = new Map(SNAPSHOT_ENTRIES.map((entry) => [hashKey(entry.queryKey), entry]));

  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    const entry = byHash.get(event.query.queryHash);
    if (entry === undefined) return;

    // La caché es de datos sin tipo (`Query<unknown>`): lo que se guarda se valida al leerlo.
    const state: { readonly data: unknown; readonly dataUpdatedAt: number } = event.query.state;
    writeEntry(storage, entry, {
      userId,
      savedAt: new Date(state.dataUpdatedAt).toISOString(),
      data: state.data,
    });
  });
}

/** Al cerrar sesión: lo de esa cuenta no puede quedarse para quien entre después. */
export function clearDeviceSnapshot(storage: StorageLike): void {
  for (const entry of SNAPSHOT_ENTRIES) removeEntry(storage, entry);
}

interface StoredSnapshot {
  readonly userId: ResourceId;
  readonly savedAt: string;
  readonly data: unknown;
}

function readEntry(storage: StorageLike, entry: SnapshotEntry): StoredSnapshot | null {
  let raw: string | null;
  try {
    raw = storage.getItem(snapshotStorageKey(entry));
  } catch (error) {
    // Safari en modo privado lanza al leer: la app sigue, solo que necesitará red para esto.
    console.warn('No se pudo leer una lectura guardada en el dispositivo', entry.name, error);
    return null;
  }
  if (raw === null) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    removeEntry(storage, entry);
    return null;
  }

  const envelope = storedSnapshotSchema.safeParse(payload);
  const data = envelope.success ? entry.schema.safeParse(envelope.data.data) : null;
  if (!envelope.success || data === null || !data.success) {
    // De una versión con otro contrato: mejor pedirlo otra vez que pintar algo que no cuadra.
    removeEntry(storage, entry);
    return null;
  }

  return { userId: envelope.data.userId, savedAt: envelope.data.savedAt, data: data.data };
}

function writeEntry(storage: StorageLike, entry: SnapshotEntry, stored: StoredSnapshot): void {
  try {
    storage.setItem(snapshotStorageKey(entry), JSON.stringify(stored));
  } catch (error) {
    // Almacenamiento lleno: la app funciona igual con red, solo no abrirá esto sin ella.
    console.warn('No se pudo guardar una lectura en el dispositivo', entry.name, error);
  }
}

function removeEntry(storage: StorageLike, entry: SnapshotEntry): void {
  try {
    storage.removeItem(snapshotStorageKey(entry));
  } catch (error) {
    console.warn('No se pudo borrar una lectura guardada en el dispositivo', entry.name, error);
  }
}
