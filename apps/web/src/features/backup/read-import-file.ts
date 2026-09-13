import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  exportFileSchema,
  planImport,
  type ExportFile,
  type ImportPlan,
} from '@gymbuddy/shared';

/** Lo que se sabe de un fichero elegido antes de escribir nada. */
export type ImportFileReading =
  | { readonly status: 'ready'; readonly file: ExportFile; readonly plan: ImportPlan }
  /** No se puede leer como JSON: otro tipo de fichero, o uno cortado a medias. */
  | { readonly status: 'not_json' }
  /** Es JSON, pero no una copia de GymBuddy. */
  | { readonly status: 'not_gymbuddy' }
  /** Es una copia de GymBuddy con una forma que esta versión de la app no sabe leer. */
  | { readonly status: 'unsupported_version'; readonly version: unknown }
  /** Dice ser de la versión que se lee, pero no cumple el contrato: retocada a mano o dañada. */
  | { readonly status: 'broken' }
  /** Válida, pero con algo que no cabe en ninguna petición: importarla dejaría una parte fuera. */
  | { readonly status: 'too_large' };

/**
 * Lee el texto de un fichero de copia. Se valida con `exportFileSchema`, el mismo esquema con el
 * que se exportó, y la marca y la versión se miran antes: un fichero de una versión futura no es
 * un fichero roto, y quien lo tiene necesita saber que el problema es la app y no su copia.
 */
export function readImportFile(text: string): ImportFileReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    console.warn('La copia elegida no es JSON', error);
    return { status: 'not_json' };
  }

  if (typeof parsed !== 'object' || parsed === null || !('format' in parsed)) {
    return { status: 'not_gymbuddy' };
  }
  if (parsed.format !== EXPORT_FORMAT) return { status: 'not_gymbuddy' };

  const version = 'version' in parsed ? parsed.version : undefined;
  if (version !== EXPORT_VERSION) return { status: 'unsupported_version', version };

  const result = exportFileSchema.safeParse(parsed);
  if (!result.success) {
    console.warn('La copia elegida no cumple el contrato', result.error.issues);
    return { status: 'broken' };
  }

  const plan = planImport(result.data);
  if (plan.oversized.length > 0) return { status: 'too_large' };

  return { status: 'ready', file: result.data, plan };
}

export interface ImportFileSummary {
  readonly exportedAt: string;
  readonly exercises: number;
  readonly sessions: number;
  readonly sets: number;
  readonly routines: number;
  /** Sesiones que en la copia seguían abiertas y entrarán cerradas. */
  readonly openSessions: number;
}

export function summarizeImportFile(file: ExportFile): ImportFileSummary {
  return {
    exportedAt: file.exportedAt,
    exercises: file.exercises.length,
    sessions: file.sessions.length,
    sets: file.sessions.reduce((total, session) => total + session.sets.length, 0),
    routines: file.routines.length,
    openSessions: file.sessions.filter((session) => session.endedAt === null).length,
  };
}
