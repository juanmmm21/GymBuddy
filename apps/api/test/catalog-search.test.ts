import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSearchTerms, searchCatalogExercises } from '../src/catalog/index';
import { createDatabase, type Database } from '../src/db/client';
import {
  BENCH_PRESS_ES,
  muscleFile,
  seedCatalogSnapshot,
  type SourceExerciseFixture,
} from './catalog-fixtures';

/** Variante de un ejercicio real, para armar escenarios de ordenación controlados. */
function variant(slug: string, name: string): SourceExerciseFixture {
  return {
    ...BENCH_PRESS_ES,
    id: `pectorals/${slug}`,
    slug,
    name,
    file: `pectorals/${slug}.gif`,
    gifUrl: `${BENCH_PRESS_ES.gifUrl.replace('barbell-bench-press', slug)}`,
  };
}

const search = (db: Database, query: string) =>
  searchCatalogExercises(db, { query, locale: 'es', limit: 20 });

describe('buildSearchTerms', () => {
  it('parte la consulta en palabras normalizadas', () => {
    expect(buildSearchTerms('Press de Banca')).toEqual(['press', 'de', 'banca']);
  });

  it('no repite una palabra escrita dos veces', () => {
    expect(buildSearchTerms('press press banca')).toEqual(['press', 'banca']);
  });

  it('devuelve nada cuando la consulta no tiene letras ni números', () => {
    expect(buildSearchTerms('   %%%  ')).toEqual([]);
  });

  it('corta en seis palabras: D1 admite cien parámetros por consulta', () => {
    expect(buildSearchTerms('una dos tres cuatro cinco seis siete ocho')).toEqual([
      'una',
      'dos',
      'tres',
      'cuatro',
      'cinco',
      'seis',
    ]);
  });
});

describe('orden de los resultados', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase(env.DB);
  });

  it('pone delante lo que empieza por lo tecleado', async () => {
    await seedCatalogSnapshot(db, {
      pectorals: {
        es: muscleFile('pectorals', [
          variant('chest-fly-press-finish', 'Aperturas con press final'),
          variant('press-plano', 'Press plano'),
        ]),
        en: muscleFile('pectorals', []),
      },
    });

    const results = await search(db, 'press');

    expect(results.map((item) => item.catalogId)).toEqual([
      'pectorals/press-plano',
      'pectorals/chest-fly-press-finish',
    ]);
  });

  it('entre dos que empiezan igual, primero el nombre más corto: el ejercicio base', async () => {
    await seedCatalogSnapshot(db, {
      pectorals: {
        es: muscleFile('pectorals', [
          variant('press-banca-inclinado-mancuernas', 'Press de banca inclinado con mancuernas'),
          variant('press-banca', 'Press de banca'),
        ]),
        en: muscleFile('pectorals', []),
      },
    });

    const results = await search(db, 'press de banca');

    expect(results.map((item) => item.catalogId)).toEqual([
      'pectorals/press-banca',
      'pectorals/press-banca-inclinado-mancuernas',
    ]);
  });

  it('exige todas las palabras, no cualquiera de ellas', async () => {
    await seedCatalogSnapshot(db, {
      pectorals: {
        es: muscleFile('pectorals', [
          variant('press-banca', 'Press de banca'),
          variant('press-militar', 'Press militar'),
        ]),
        en: muscleFile('pectorals', []),
      },
    });

    expect(await search(db, 'press banca')).toHaveLength(1);
    expect(await search(db, 'press')).toHaveLength(2);
  });

  it('respeta el límite pedido', async () => {
    await seedCatalogSnapshot(db, {
      pectorals: {
        es: muscleFile('pectorals', [
          variant('press-uno', 'Press uno'),
          variant('press-dos', 'Press dos'),
          variant('press-tres', 'Press tres'),
        ]),
        en: muscleFile('pectorals', []),
      },
    });

    const results = await searchCatalogExercises(db, { query: 'press', locale: 'es', limit: 2 });

    expect(results).toHaveLength(2);
  });
});
