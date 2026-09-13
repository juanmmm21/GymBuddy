import { z } from 'zod';
import { bodyPartSchema, muscleSchema } from './catalog';
import {
  isoDatetimeSchema,
  localeSchema,
  resourceIdSchema,
  rpeSchema,
  unitSystemSchema,
  volumeKilogramsSchema,
  weightKilogramsSchema,
} from './common';
import { personalRecordKindSchema } from './record';

/*
 * La copia de seguridad del usuario. Sus esquemas se escriben aquí enteros y no derivan de los
 * de la API a propósito: un fichero descargado hoy tiene que poder leerse dentro de un año, y
 * si su forma dependiera de `trackedExerciseSchema` cualquier cambio de la API cambiaría en
 * silencio lo que significa `version: 1`. Lo único que se reutiliza son las unidades
 * ("82.50", el RPE, las fechas ISO), que son la forma de escribir un dato y no la de un recurso.
 */

/** Marca con la que un importador reconoce el fichero antes de mirar nada más. */
export const EXPORT_FORMAT = 'gymbuddy-export';

/** Se sube cuando cambia la forma del fichero, nunca por un cambio de la API. */
export const EXPORT_VERSION = 1;

/** Tope de sesiones por página al exportar: cada una arrastra sus series y sus marcas. */
export const MAX_EXPORT_SESSION_PAGE_SIZE = 50;

export const exportedProfileSchema = z.object({
  displayName: z.string().min(1),
  locale: localeSchema,
  unitSystem: unitSystemSchema,
});

/**
 * Un ejercicio seguido. El de catálogo lleva su `catalogId`, que es lo que lo identifica, y
 * además el nombre con el que se veía al exportar: la cuenta de destino puede no tener ese
 * ejercicio sincronizado, y entonces el nombre es lo único legible que queda de él.
 */
export const exportedExerciseSchema = z
  .object({
    id: resourceIdSchema,
    origin: z.enum(['catalog', 'custom']),
    catalogId: z.string().min(1).nullable(),
    name: z.string().min(1),
    muscle: muscleSchema.nullable(),
    bodyPart: bodyPartSchema.nullable(),
    notes: z.string().nullable(),
    createdAt: isoDatetimeSchema,
    archivedAt: isoDatetimeSchema.nullable(),
  })
  .refine((exercise) => (exercise.origin === 'catalog') === (exercise.catalogId !== null), {
    message: 'Un ejercicio del catálogo lleva catalogId y uno propio no',
    path: ['catalogId'],
  });

/**
 * Una marca personal va dentro de la serie que la puso, y no en una lista aparte que la
 * referencie: así viajan en la misma página que su serie y no puede quedar una marca que
 * apunte a una serie que el fichero no trae.
 */
export const exportedRecordSchema = z.object({
  id: resourceIdSchema,
  kind: personalRecordKindSchema,
  value: volumeKilogramsSchema,
  achievedAt: isoDatetimeSchema,
});

export const exportedSetSchema = z.object({
  id: resourceIdSchema,
  trackedExerciseId: resourceIdSchema,
  orderIndex: z.int().nonnegative(),
  weight: weightKilogramsSchema,
  reps: z.int().positive(),
  rpe: rpeSchema.nullable(),
  isWarmup: z.boolean(),
  completedAt: isoDatetimeSchema,
  records: z.array(exportedRecordSchema),
});

export const exportedSessionSchema = z.object({
  id: resourceIdSchema,
  startedAt: isoDatetimeSchema,
  endedAt: isoDatetimeSchema.nullable(),
  notes: z.string().nullable(),
  sets: z.array(exportedSetSchema),
});

export const exportedRoutineItemSchema = z
  .object({
    id: resourceIdSchema,
    trackedExerciseId: resourceIdSchema,
    orderIndex: z.int().nonnegative(),
    targetSets: z.int().positive(),
    targetRepsMin: z.int().positive(),
    targetRepsMax: z.int().positive(),
  })
  .refine((item) => item.targetRepsMax >= item.targetRepsMin, {
    message: 'El máximo de repeticiones no puede ser menor que el mínimo',
    path: ['targetRepsMax'],
  });

export const exportedRoutineSchema = z.object({
  id: resourceIdSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  createdAt: isoDatetimeSchema,
  archivedAt: isoDatetimeSchema.nullable(),
  items: z.array(exportedRoutineItemSchema),
});

/**
 * Todo lo del usuario menos las sesiones, en una sola respuesta. Se pide **después** de las
 * páginas de sesiones: los ejercicios no se borran nunca, así que leídos al final están todos
 * los que nombran las series ya descargadas, aunque se haya creado uno a mitad de exportar.
 */
export const exportSnapshotSchema = z.object({
  exportedAt: isoDatetimeSchema,
  profile: exportedProfileSchema,
  exercises: z.array(exportedExerciseSchema),
  routines: z.array(exportedRoutineSchema),
});

/**
 * Una página de sesiones con sus series, de la más antigua a la más reciente. Va en ese orden
 * porque una sesión abierta durante la exportación se añade al final y no desplaza a nadie:
 * con el orden de la pantalla de historial, pedir por desplazamiento saltaría una sesión.
 */
export const exportSessionPageSchema = z.object({
  items: z.array(exportedSessionSchema),
  total: z.int().nonnegative(),
  limit: z.int().positive(),
  offset: z.int().nonnegative(),
});

const exportFileShapeSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: isoDatetimeSchema,
  profile: exportedProfileSchema,
  exercises: z.array(exportedExerciseSchema),
  sessions: z.array(exportedSessionSchema),
  routines: z.array(exportedRoutineSchema),
});

type ExportFileShape = z.infer<typeof exportFileShapeSchema>;

/**
 * El fichero entero. Además de la forma, comprueba lo que un importador daría por hecho: que
 * ningún identificador se repite y que toda serie y toda línea de rutina nombran un ejercicio
 * que el fichero trae. Sin eso, un fichero retocado a mano fallaría a mitad de importar, con
 * la mitad de las filas ya escritas.
 */
export const exportFileSchema = exportFileShapeSchema.superRefine((file, context) => {
  for (const issue of findExportFileIssues(file)) {
    context.addIssue({ code: 'custom', message: issue.message, path: [...issue.path] });
  }
});

interface ExportFileIssue {
  readonly message: string;
  readonly path: readonly (string | number)[];
}

function findExportFileIssues(file: ExportFileShape): ExportFileIssue[] {
  const issues: ExportFileIssue[] = [];
  const exerciseIds = new Set<string>();
  const catalogIds = new Set<string>();

  // Un identificador se repite por tabla, igual que la clave primaria que lo va a recibir.
  const seenIds = new Map<string, Set<string>>();
  const claim = (table: string, id: string, path: readonly (string | number)[]): void => {
    const seen = seenIds.get(table) ?? new Set<string>();
    if (seen.has(id)) issues.push({ message: `El identificador ${id} está repetido`, path });
    seen.add(id);
    seenIds.set(table, seen);
  };

  file.exercises.forEach((exercise, index) => {
    claim('exercise', exercise.id, ['exercises', index, 'id']);
    exerciseIds.add(exercise.id);

    if (exercise.catalogId === null) return;
    // La base no deja seguir dos veces el mismo ejercicio del catálogo.
    if (catalogIds.has(exercise.catalogId)) {
      issues.push({
        message: `El ejercicio del catálogo ${exercise.catalogId} aparece dos veces`,
        path: ['exercises', index, 'catalogId'],
      });
    }
    catalogIds.add(exercise.catalogId);
  });

  const requireExercise = (id: string, path: readonly (string | number)[]): void => {
    if (!exerciseIds.has(id)) {
      issues.push({ message: `El ejercicio ${id} no está en el fichero`, path });
    }
  };

  file.sessions.forEach((session, sessionIndex) => {
    claim('session', session.id, ['sessions', sessionIndex, 'id']);

    session.sets.forEach((set, setIndex) => {
      const setPath = ['sessions', sessionIndex, 'sets', setIndex];
      claim('set', set.id, [...setPath, 'id']);
      requireExercise(set.trackedExerciseId, [...setPath, 'trackedExerciseId']);

      set.records.forEach((record, recordIndex) => {
        claim('record', record.id, [...setPath, 'records', recordIndex, 'id']);
      });
    });
  });

  file.routines.forEach((routine, routineIndex) => {
    claim('routine', routine.id, ['routines', routineIndex, 'id']);

    routine.items.forEach((item, itemIndex) => {
      const itemPath = ['routines', routineIndex, 'items', itemIndex];
      claim('routineItem', item.id, [...itemPath, 'id']);
      requireExercise(item.trackedExerciseId, [...itemPath, 'trackedExerciseId']);
    });
  });

  return issues;
}

/**
 * Junta las piezas descargadas en el fichero. Es aquí y no en la PWA donde se escriben la
 * marca y la versión, para que no haya un segundo sitio que pueda equivocarse de número.
 */
export function buildExportFile(
  snapshot: ExportSnapshot,
  sessions: readonly ExportedSession[],
): ExportFile {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: snapshot.exportedAt,
    profile: snapshot.profile,
    exercises: snapshot.exercises,
    sessions: [...sessions],
    routines: snapshot.routines,
  };
}

export type ExportedProfile = z.infer<typeof exportedProfileSchema>;
export type ExportedExercise = z.infer<typeof exportedExerciseSchema>;
export type ExportedRecord = z.infer<typeof exportedRecordSchema>;
export type ExportedSet = z.infer<typeof exportedSetSchema>;
export type ExportedSession = z.infer<typeof exportedSessionSchema>;
export type ExportedRoutineItem = z.infer<typeof exportedRoutineItemSchema>;
export type ExportedRoutine = z.infer<typeof exportedRoutineSchema>;
export type ExportSnapshot = z.infer<typeof exportSnapshotSchema>;
export type ExportSessionPage = z.infer<typeof exportSessionPageSchema>;
export type ExportFile = z.infer<typeof exportFileSchema>;
