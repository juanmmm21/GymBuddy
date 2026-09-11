import type { Locale } from '@gymbuddy/shared';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { buildSearchTerms, searchCatalogExercises } from '../catalog/repository';
import { normalizeSearchText } from '../catalog/snapshot';
import type { Database } from '../db/client';
import { catalogExercise, trackedExercise } from '../db/schema';

/**
 * Cuántas opciones se ofrecen como botones. Seis caben en la pantalla de un móvil sin
 * desplazar el chat; si hay más, el mensaje pide escribir más del nombre.
 */
export const MAX_EXERCISE_CHOICES = 6;

/** Un ejercicio seguido con el nombre que ve el usuario y el texto sobre el que se busca. */
export interface NamedExercise {
  readonly id: string;
  readonly name: string;
  readonly searchText: string;
}

export interface ExerciseOption {
  readonly id: string;
  readonly name: string;
}

export interface CatalogOption {
  readonly catalogId: string;
  readonly name: string;
}

/**
 * A qué ejercicio va la serie. Las reglas las decidió Juan: primero sus ejercicios seguidos;
 * si casan varios, se pregunta —aunque uno se llame exactamente como lo tecleado—; y si no
 * casa ninguno, se ofrecen los del catálogo para elegir en vez de seguir uno sin preguntar.
 */
export type ExerciseResolution =
  | { readonly kind: 'tracked'; readonly exercise: ExerciseOption }
  | {
      readonly kind: 'ambiguous';
      readonly options: readonly ExerciseOption[];
      /** Cuántos casan en total: si pasan de los botones, el mensaje lo dice. */
      readonly total: number;
    }
  | { readonly kind: 'catalog'; readonly options: readonly CatalogOption[] }
  | { readonly kind: 'not_found' };

export async function resolveExerciseName(
  db: Database,
  userId: string,
  locale: Locale,
  query: string,
): Promise<ExerciseResolution> {
  const active = await listNamedExercises(db, userId, locale, isNull(trackedExercise.archivedAt));
  const matches = matchTrackedExercises(active, query);

  const [first] = matches;
  if (first !== undefined && matches.length === 1) {
    return { kind: 'tracked', exercise: { id: first.id, name: first.name } };
  }
  if (matches.length > 1) {
    return {
      kind: 'ambiguous',
      options: matches.slice(0, MAX_EXERCISE_CHOICES).map(({ id, name }) => ({ id, name })),
      total: matches.length,
    };
  }

  const catalog = await searchCatalogExercises(db, {
    query,
    locale,
    limit: MAX_EXERCISE_CHOICES,
  });
  if (catalog.length === 0) return { kind: 'not_found' };

  return {
    kind: 'catalog',
    options: catalog.map(({ catalogId, name }) => ({ catalogId, name })),
  };
}

/**
 * Las mismas reglas que la búsqueda del catálogo, aplicadas a los ejercicios del usuario:
 * cada palabra se exige por separado y en cualquier orden, primero lo que empieza por lo
 * tecleado, luego el nombre más corto y por último el alfabético, para que el orden de los
 * botones no baile entre dos mensajes iguales. Va en memoria porque son decenas de filas,
 * no las 1323 del catálogo.
 */
export function matchTrackedExercises(
  exercises: readonly NamedExercise[],
  query: string,
): NamedExercise[] {
  const terms = buildSearchTerms(query);
  const [firstTerm] = terms;
  if (firstTerm === undefined) return [];

  const prefixRank = (exercise: NamedExercise): number =>
    exercise.searchText.startsWith(firstTerm) ? 0 : 1;

  return exercises
    .filter((exercise) => terms.every((term) => exercise.searchText.includes(term)))
    .sort(
      (a, b) =>
        prefixRank(a) - prefixRank(b) ||
        a.name.length - b.name.length ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
}

/** Un ejercicio del usuario con su nombre, archivado o no: la serie se acepta igual. */
export async function findNamedExercise(
  db: Database,
  userId: string,
  locale: Locale,
  exerciseId: string,
): Promise<ExerciseOption | null> {
  const [exercise] = await listNamedExercises(
    db,
    userId,
    locale,
    eq(trackedExercise.id, exerciseId),
  );

  return exercise === undefined ? null : { id: exercise.id, name: exercise.name };
}

async function listNamedExercises(
  db: Database,
  userId: string,
  locale: Locale,
  filter: SQL,
): Promise<NamedExercise[]> {
  const rows = await db
    .select({
      id: trackedExercise.id,
      customName: trackedExercise.customName,
      nameEs: catalogExercise.nameEs,
      nameEn: catalogExercise.nameEn,
      searchText: catalogExercise.searchText,
    })
    .from(trackedExercise)
    .leftJoin(catalogExercise, eq(trackedExercise.catalogId, catalogExercise.catalogId))
    .where(and(eq(trackedExercise.userId, userId), filter));

  return rows.flatMap((row) => {
    const catalogName = locale === 'es' ? row.nameEs : row.nameEn;
    const name = catalogName ?? row.customName;
    // Uno del catálogo busca sobre `search_text`, que ya lleva sus dos idiomas: «bench» y
    // «banca» encuentran el mismo ejercicio seguido igual que en el buscador de la PWA.
    const searchText = row.searchText ?? (name === null ? null : normalizeSearchText(name));

    return name === null || searchText === null ? [] : [{ id: row.id, name, searchText }];
  });
}
