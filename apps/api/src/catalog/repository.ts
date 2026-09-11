import {
  bodyPartSchema,
  muscleSchema,
  type BodyPart,
  type BodyPartSummary,
  type CatalogExercise,
  type CatalogExercisePage,
  type CatalogExerciseSummary,
  type Locale,
} from '@gymbuddy/shared';
import { and, asc, count, eq, like, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client';
import { catalogExercise, type CatalogExerciseRow } from '../db/schema';
import { normalizeSearchText } from './snapshot';

/**
 * Tope de palabras que se tienen en cuenta al buscar. D1 admite cien parámetros por
 * consulta y cada palabra gasta uno: nadie escribe seis palabras en el buscador del
 * gimnasio, y así una consulta absurda no puede tumbar la petición.
 */
const MAX_SEARCH_TERMS = 6;

const secondaryMusclesSchema = z.array(muscleSchema);

/** Columnas del resumen: se deja fuera lo caro (instrucciones) porque el listado no lo pinta. */
const summaryColumns = {
  catalogId: catalogExercise.catalogId,
  nameEs: catalogExercise.nameEs,
  nameEn: catalogExercise.nameEn,
  muscle: catalogExercise.muscle,
  bodyPart: catalogExercise.bodyPart,
  equipment: catalogExercise.equipment,
  gifUrl: catalogExercise.gifUrl,
  searchText: catalogExercise.searchText,
};

type SummaryRow = {
  [K in keyof typeof summaryColumns]: string;
};

/** Las siete partes del cuerpo con cuántos ejercicios tiene cada una: es la pantalla de entrada. */
export async function listBodyPartSummaries(db: Database): Promise<BodyPartSummary[]> {
  const rows = await db
    .select({ bodyPart: catalogExercise.bodyPart, exerciseCount: count() })
    .from(catalogExercise)
    .groupBy(catalogExercise.bodyPart)
    .orderBy(asc(catalogExercise.bodyPart));

  return rows.map((row) => ({
    bodyPart: bodyPartSchema.parse(row.bodyPart),
    exerciseCount: row.exerciseCount,
  }));
}

export interface CatalogPageQuery {
  readonly bodyPart: BodyPart;
  readonly locale: Locale;
  readonly limit: number;
  readonly offset: number;
}

/** Una página de ejercicios de una parte del cuerpo, ordenada por nombre en el idioma pedido. */
export async function listExercisesByBodyPart(
  db: Database,
  query: CatalogPageQuery,
): Promise<CatalogExercisePage> {
  const filter = eq(catalogExercise.bodyPart, query.bodyPart);
  const nameColumn = query.locale === 'es' ? catalogExercise.nameEs : catalogExercise.nameEn;

  // El total y la página salen en un solo viaje a D1: dos consultas sueltas doblarían la
  // latencia de una pantalla que se abre en cada visita al catálogo.
  const [totals, rows] = await db.batch([
    db.select({ total: count() }).from(catalogExercise).where(filter),
    db
      .select(summaryColumns)
      .from(catalogExercise)
      .where(filter)
      .orderBy(asc(nameColumn))
      .limit(query.limit)
      .offset(query.offset),
  ]);

  return {
    items: rows.map((row) => toSummary(row, query.locale)),
    total: totals[0]?.total ?? 0,
    limit: query.limit,
    offset: query.offset,
  };
}

/** La ficha completa de un ejercicio, con sus instrucciones en el idioma pedido. */
export async function findCatalogExercise(
  db: Database,
  catalogId: string,
  locale: Locale,
): Promise<CatalogExercise | null> {
  const [row] = await db
    .select()
    .from(catalogExercise)
    .where(eq(catalogExercise.catalogId, catalogId))
    .limit(1);

  return row === undefined ? null : toExercise(row, locale);
}

export interface CatalogSearchQuery {
  readonly query: string;
  readonly locale: Locale;
  readonly limit: number;
}

/**
 * Busca por nombre sobre `search_text`, que ya está en minúsculas y sin acentos: "biceps"
 * encuentra "bíceps" y "banca press" encuentra "press de banca" porque cada palabra se
 * exige por separado y el orden dentro de la frase da igual, que es como se teclea deprisa
 * en el buscador de la PWA.
 */
export async function searchCatalogExercises(
  db: Database,
  search: CatalogSearchQuery,
): Promise<CatalogExerciseSummary[]> {
  const terms = buildSearchTerms(search.query);
  if (terms.length === 0) return [];

  const [firstTerm] = terms;
  if (firstTerm === undefined) return [];

  const conditions: SQL[] = terms.map((term) => like(catalogExercise.searchText, `%${term}%`));

  const rows = await db
    .select(summaryColumns)
    .from(catalogExercise)
    .where(and(...conditions))
    .orderBy(
      // Lo que empieza por lo tecleado va primero; después, el nombre más corto, que es el
      // ejercicio base frente a sus veinte variantes. El nombre final desempata sin azar.
      sql`case when ${catalogExercise.searchText} like ${`${firstTerm}%`} then 0 else 1 end`,
      sql`length(${catalogExercise.searchText})`,
      asc(catalogExercise.nameEs),
    )
    .limit(search.limit);

  return rows.map((row) => toSummary(row, search.locale));
}

/**
 * Parte la consulta en palabras normalizadas igual que `search_text`. Es pura y va aparte
 * porque es la mitad del comportamiento de la búsqueda y se prueba sin base de datos.
 */
export function buildSearchTerms(query: string): string[] {
  const normalized = normalizeSearchText(query);
  if (normalized === '') return [];

  // La normalización ya deja fuera `%` y `_`, así que ningún término puede colarse como
  // comodín dentro del LIKE.
  return [...new Set(normalized.split(' ').filter((term) => term !== ''))].slice(
    0,
    MAX_SEARCH_TERMS,
  );
}

function toSummary(row: SummaryRow, locale: Locale): CatalogExerciseSummary {
  return {
    catalogId: row.catalogId,
    name: locale === 'es' ? row.nameEs : row.nameEn,
    muscle: muscleSchema.parse(row.muscle),
    bodyPart: bodyPartSchema.parse(row.bodyPart),
    equipment: row.equipment,
    gifUrl: row.gifUrl,
  };
}

/**
 * Las columnas `muscle` y `body_part` son texto en SQLite, así que se validan al salir. No
 * es defensa contra el catálogo —la sincronización ya lo valida al entrar— sino contra
 * nosotros: si algo escribiera un valor fuera de los enums, se ve aquí y no en la PWA.
 */
function toExercise(row: CatalogExerciseRow, locale: Locale): CatalogExercise {
  return {
    ...toSummary(row, locale),
    category: row.category,
    secondaryMuscles: secondaryMusclesSchema.parse(row.secondaryMuscles),
    instructions: locale === 'es' ? row.instructionsEs : row.instructionsEn,
    syncedAt: row.syncedAt,
  };
}
