import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildSearchTerms,
  CATALOG_BASE_URL,
  planCatalogSearch,
  searchCatalogExercises,
  singularizeSearchTerm,
} from '../src/catalog/index';
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

/** Un ejercicio de cualquier músculo y parte del cuerpo, con el nombre que haga falta. */
function catalogEntry(
  muscle: string,
  bodyPart: string,
  slug: string,
  name: string,
): SourceExerciseFixture {
  return {
    ...BENCH_PRESS_ES,
    id: `${muscle}/${slug}`,
    slug,
    name,
    muscle,
    bodyPart,
    secondaryMuscles: [],
    file: `${muscle}/${slug}.gif`,
    gifUrl: `${CATALOG_BASE_URL}/${muscle}/${slug}.gif`,
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

describe('singularizeSearchTerm', () => {
  it('recorta el plural en español y en inglés a un trozo de la palabra', () => {
    expect(singularizeSearchTerm('elevaciones')).toBe('elevacion');
    expect(singularizeSearchTerm('laterales')).toBe('lateral');
    expect(singularizeSearchTerm('poleas')).toBe('polea');
    expect(singularizeSearchTerm('rows')).toBe('row');
  });

  it('no toca lo que no es plural ni deja trozos que casen con todo', () => {
    expect(singularizeSearchTerm('press')).toBe('press');
    expect(singularizeSearchTerm('abs')).toBe('abs');
    expect(singularizeSearchTerm('pies')).toBe('pie');
    expect(singularizeSearchTerm('curl')).toBe('curl');
  });
});

describe('planCatalogSearch', () => {
  it('sin alias hay una sola lectura, ya en singular', () => {
    expect(planCatalogSearch('Elevaciones laterales')).toEqual([
      [
        { text: 'elevacion', bodyPart: null },
        { text: 'lateral', bodyPart: null },
      ],
    ]);
  });

  it('un nombre de gimnasio añade la lectura con las palabras del catálogo', () => {
    const [literal, translated] = planCatalogSearch('Face Pull');

    expect(literal?.map(({ text }) => text)).toEqual(['face', 'pull']);
    expect(translated?.map(({ text }) => text)).toEqual(['deltoid', 'posterior', 'cuerda']);
  });

  it('traduce el alias dentro de una frase más larga y deja el resto', () => {
    const [, translated] = planCatalogSearch('remo gironda cuerda');

    expect(translated?.map(({ text }) => text)).toEqual(['remo', 'sentado', 'polea', 'cuerda']);
  });

  it('las palabras de una parte del cuerpo la nombran, en los dos idiomas y en plural', () => {
    expect(planCatalogSearch('espalda')[0]).toEqual([{ text: 'espalda', bodyPart: 'back' }]);
    expect(planCatalogSearch('shoulders')[0]).toEqual([
      { text: 'shoulder', bodyPart: 'shoulders' },
    ]);
  });

  it('una palabra que coincide con una propiedad de Object no nombra nada', () => {
    expect(planCatalogSearch('constructor')).toEqual([[{ text: 'constructor', bodyPart: null }]]);
  });

  it('sin palabras no hay lectura', () => {
    expect(planCatalogSearch('  %% ')).toEqual([]);
  });
});

describe('búsqueda libre', () => {
  let db: Database;

  beforeEach(async () => {
    db = createDatabase(env.DB);
    await seedCatalogSnapshot(db, {
      delts: {
        es: muscleFile('delts', [
          catalogEntry(
            'delts',
            'shoulders',
            'cable-standing-rear-delt-row-with-rope',
            'Remo de deltoides posterior en polea, de pie, con cuerda',
          ),
          catalogEntry(
            'delts',
            'shoulders',
            'dumbbell-lateral-raise',
            'Elevación lateral con mancuerna',
          ),
        ]),
        en: muscleFile('delts', []),
      },
      'upper-back': {
        es: muscleFile('upper-back', [
          catalogEntry('upper-back', 'back', 'cable-seated-row', 'Remo sentado en polea'),
        ]),
        en: muscleFile('upper-back', []),
      },
      glutes: {
        es: muscleFile('glutes', [
          catalogEntry('glutes', 'legs', 'band-hip-thrust', 'Hip thrust con banda elástica'),
          catalogEntry('glutes', 'legs', 'barbell-glute-bridge', 'Puente de glúteos con barra'),
        ]),
        en: muscleFile('glutes', []),
      },
    });
  });

  const ids = async (query: string) => (await search(db, query)).map((item) => item.catalogId);

  it('«face pull» encuentra el remo de deltoides posterior con cuerda', async () => {
    expect(await ids('face pull')).toEqual(['delts/cable-standing-rear-delt-row-with-rope']);
  });

  it('tolera el plural: «elevaciones laterales» encuentra la elevación lateral', async () => {
    expect(await ids('elevaciones laterales')).toEqual(['delts/dumbbell-lateral-raise']);
  });

  it('«espalda polea» casa por la parte del cuerpo aunque el nombre no diga espalda', async () => {
    expect(await ids('espalda polea')).toEqual(['upper-back/cable-seated-row']);
  });

  it('un alias añade resultados sin quitar el que ya casaba con lo tecleado', async () => {
    expect((await ids('hip thrust')).sort()).toEqual([
      'glutes/band-hip-thrust',
      'glutes/barbell-glute-bridge',
    ]);
  });

  it('seis palabras con alias y partes del cuerpo caben en los parámetros de D1', async () => {
    expect(await ids('face pull espalda pecho pierna brazos')).toEqual([]);
  });
});
