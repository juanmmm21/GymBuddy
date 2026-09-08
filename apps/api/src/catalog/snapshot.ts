import type { Muscle } from '@gymbuddy/shared';
import type { NewCatalogExerciseRow } from '../db/schema';
import { sourceExerciseSchema, type SourceExercise, type SourceMuscleFile } from './source';

/**
 * Texto sobre el que buscan la API y el parser del bot. Se guarda ya normalizado porque
 * SQLite no sabe ignorar acentos: si la normalización se hiciera al consultar, `LIKE` no
 * podría usar el índice y "biceps" no encontraría "bíceps".
 */
export function normalizeSearchText(value: string): string {
  return (
    value
      .normalize('NFD')
      // Fuera los diacríticos ya separados por NFD: "bíceps" y "biceps" pasan a ser lo mismo.
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      // Guiones, comas y paréntesis se vuelven separadores: se busca por palabras sueltas.
      .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
      .trim()
  );
}

export interface CatalogRowsResult {
  readonly rows: NewCatalogExerciseRow[];
  /** Ejercicios que el origen trajo fuera de contrato, con el motivo. Se registran, no se ocultan. */
  readonly skipped: readonly string[];
}

export interface BuildCatalogRowsInput {
  readonly muscle: Muscle;
  readonly spanish: SourceMuscleFile;
  readonly english: SourceMuscleFile;
  readonly catalogVersion: string;
  readonly syncedAt: string;
}

/**
 * Cruza los dos ficheros de idioma de un músculo y produce las filas del snapshot. Los ids
 * son los mismos en `es` y en `en`, así que el cruce es directo; si un ejercicio faltase en
 * un idioma se guarda el del otro, que es la misma degradación que hace la PWA al leerlo.
 */
export function buildCatalogRows(input: BuildCatalogRowsInput): CatalogRowsResult {
  const skipped: string[] = [];
  const spanish = validExercises(input.muscle, input.spanish, 'es', skipped);
  const english = validExercises(input.muscle, input.english, 'en', skipped);

  const spanishById = new Map(spanish.map((exercise) => [exercise.id, exercise]));
  const englishById = new Map(english.map((exercise) => [exercise.id, exercise]));
  // El orden del fichero español manda; los que solo existan en inglés van detrás.
  const catalogIds = [...new Set([...spanishById.keys(), ...englishById.keys()])];

  const rows: NewCatalogExerciseRow[] = [];

  for (const catalogId of catalogIds) {
    const spanishExercise = spanishById.get(catalogId);
    const englishExercise = englishById.get(catalogId);
    // El id sale de uno de los dos mapas, así que al menos uno existe: el guard está por
    // el tipado, no porque pueda pasar.
    const present = spanishExercise ?? englishExercise;
    if (present === undefined) continue;

    rows.push(
      toRow(
        spanishExercise ?? present,
        englishExercise ?? present,
        input.catalogVersion,
        input.syncedAt,
      ),
    );
  }

  return { rows, skipped };
}

function toRow(
  spanish: SourceExercise,
  english: SourceExercise,
  catalogVersion: string,
  syncedAt: string,
): NewCatalogExerciseRow {
  const names = [spanish.name, english.name];
  const searchText = [...new Set(names.map(normalizeSearchText))].join(' ');

  return {
    catalogId: spanish.id,
    slug: spanish.slug,
    muscle: spanish.muscle,
    bodyPart: spanish.bodyPart,
    equipment: spanish.equipment,
    category: spanish.category,
    secondaryMuscles: spanish.secondaryMuscles,
    gifUrl: spanish.gifUrl,
    nameEs: spanish.name,
    nameEn: english.name,
    instructionsEs: spanish.instructions,
    instructionsEn: english.instructions,
    searchText,
    catalogVersion,
    syncedAt,
  };
}

/**
 * Valida los ejercicios de un fichero de uno en uno. Uno fuera de contrato se descarta con
 * su motivo en vez de invalidar el músculo entero: perder un ejercicio es mucho menos malo
 * que dejar el catálogo sin sincronizar.
 */
function validExercises(
  muscle: Muscle,
  file: SourceMuscleFile,
  locale: 'es' | 'en',
  skipped: string[],
): SourceExercise[] {
  const valid: SourceExercise[] = [];

  for (const [index, candidate] of file.exercises.entries()) {
    const parsed = sourceExerciseSchema.safeParse(candidate);
    if (!parsed.success) {
      skipped.push(`${muscle}[${String(index)}] (${locale}): fuera del contrato del catálogo`);
      continue;
    }

    if (parsed.data.muscle !== muscle) {
      skipped.push(`${parsed.data.id} (${locale}): declara el músculo ${parsed.data.muscle}`);
      continue;
    }

    // El id del catálogo es "{muscle}/{slug}" y es la clave primaria del snapshot: si no
    // cuadra con sus propios campos, la referencia desde "mis ejercicios" quedaría rota.
    if (parsed.data.id !== `${parsed.data.muscle}/${parsed.data.slug}`) {
      skipped.push(`${parsed.data.id} (${locale}): el id no cuadra con su músculo y su slug`);
      continue;
    }

    valid.push(parsed.data);
  }

  return valid;
}
