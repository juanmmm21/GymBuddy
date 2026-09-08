import { muscleSchema, type Locale, type Muscle } from '@gymbuddy/shared';
import { buildCatalogRows } from '../src/catalog/snapshot';
import { CATALOG_BASE_URL, sourceMuscleFileSchema } from '../src/catalog/source';
import type { Database } from '../src/db/client';
import { catalogExercise, catalogSyncState, type NewCatalogExerciseRow } from '../src/db/schema';

/**
 * Respuestas del catálogo copiadas a mano del CDN en el tag `v1.1.0`. Ningún test toca la
 * red: si estas fixtures se quedan atrás, lo que falla es un test y no la CI entera por un
 * jsDelivr caído. Los tres músculos con datos bastan para cubrir los casos que importan
 * (dos partes del cuerpo distintas, acentos, músculos secundarios); el resto del ciclo se
 * recorre con ficheros vacíos, que es también lo que hay que saber tolerar.
 */
export interface SourceExerciseFixture {
  id: string;
  slug: string;
  name: string;
  muscle: string;
  bodyPart: string;
  equipment: string;
  category: string;
  secondaryMuscles: string[];
  instructions: string[];
  file: string;
  gifUrl: string;
}

export interface MuscleFileFixture {
  muscle: string;
  count: number;
  exercises: unknown[];
}

const gif = (path: string): string => `${CATALOG_BASE_URL}/${path}.gif`;

export const BENCH_PRESS_ES: SourceExerciseFixture = {
  id: 'pectorals/barbell-bench-press',
  slug: 'barbell-bench-press',
  name: 'Press de banca con barra',
  muscle: 'pectorals',
  bodyPart: 'chest',
  equipment: 'barbell',
  category: 'strength',
  secondaryMuscles: ['triceps', 'delts'],
  instructions: [
    'Carga el peso adecuado en la barra y adopta la postura inicial.',
    'Activa el pectoral antes de iniciar el movimiento.',
    'Vuelve a la posición inicial controlando la fase excéntrica.',
  ],
  file: 'pectorals/barbell-bench-press.gif',
  gifUrl: gif('pectorals/barbell-bench-press'),
};

export const BENCH_PRESS_EN: SourceExerciseFixture = {
  ...BENCH_PRESS_ES,
  name: 'Barbell Bench Press',
  instructions: [
    'Load the bar with an appropriate weight and adopt the starting position.',
    'Pre-engage the chest before initiating the movement.',
    'Return to the starting position controlling the eccentric phase.',
  ],
};

export const ARCHER_PUSH_UP_ES: SourceExerciseFixture = {
  id: 'pectorals/archer-push-up',
  slug: 'archer-push-up',
  name: 'Flexión del arquero',
  muscle: 'pectorals',
  bodyPart: 'chest',
  equipment: 'bodyweight',
  category: 'strength',
  secondaryMuscles: ['triceps', 'delts'],
  instructions: [
    'Adopta la postura inicial con buena alineación corporal.',
    'Realiza el movimiento de forma controlada manteniendo la técnica.',
  ],
  file: 'pectorals/archer-push-up.gif',
  gifUrl: gif('pectorals/archer-push-up'),
};

export const ARCHER_PUSH_UP_EN: SourceExerciseFixture = {
  ...ARCHER_PUSH_UP_ES,
  name: 'Archer Push Up',
  instructions: [
    'Adopt the starting position with proper body alignment.',
    'Perform the movement in a controlled manner, keeping good form.',
  ],
};

export const HIP_ABDUCTION_ES: SourceExerciseFixture = {
  id: 'abductors/side-hip-abduction',
  slug: 'side-hip-abduction',
  name: 'Abducción de cadera lateral',
  muscle: 'abductors',
  bodyPart: 'legs',
  equipment: 'bodyweight',
  category: 'strength',
  secondaryMuscles: [],
  instructions: ['Adopta la postura inicial con buena alineación corporal.'],
  file: 'abductors/side-hip-abduction.gif',
  gifUrl: gif('abductors/side-hip-abduction'),
};

export const HIP_ABDUCTION_EN: SourceExerciseFixture = {
  ...HIP_ABDUCTION_ES,
  name: 'Side Hip Abduction',
  instructions: ['Adopt the starting position with proper body alignment.'],
};

export const NECK_STRETCH_ES: SourceExerciseFixture = {
  id: 'levator-scapulae/neck-side-stretch',
  slug: 'neck-side-stretch',
  name: 'Estiramiento, lateral, cuello',
  muscle: 'levator-scapulae',
  bodyPart: 'back',
  equipment: 'bodyweight',
  category: 'stretching',
  secondaryMuscles: [],
  instructions: ['Mantén entre 20 y 40 segundos respirando de forma profunda.'],
  file: 'levator-scapulae/neck-side-stretch.gif',
  gifUrl: gif('levator-scapulae/neck-side-stretch'),
};

export const NECK_STRETCH_EN: SourceExerciseFixture = {
  ...NECK_STRETCH_ES,
  name: 'Neck Side Stretch',
  instructions: ['Hold for 20 to 40 seconds breathing deeply.'],
};

export function muscleFile(muscle: string, exercises: unknown[]): MuscleFileFixture {
  return { muscle, count: exercises.length, exercises };
}

/** Los ficheros que sirve el CDN falso, por músculo e idioma. Lo no listado va vacío. */
export type CatalogSourceFixtures = Partial<
  Record<Muscle, Record<Locale, MuscleFileFixture | undefined>>
>;

export const DEFAULT_SOURCE_FIXTURES: CatalogSourceFixtures = {
  abductors: {
    es: muscleFile('abductors', [HIP_ABDUCTION_ES]),
    en: muscleFile('abductors', [HIP_ABDUCTION_EN]),
  },
  'levator-scapulae': {
    es: muscleFile('levator-scapulae', [NECK_STRETCH_ES]),
    en: muscleFile('levator-scapulae', [NECK_STRETCH_EN]),
  },
  pectorals: {
    es: muscleFile('pectorals', [BENCH_PRESS_ES, ARCHER_PUSH_UP_ES]),
    en: muscleFile('pectorals', [BENCH_PRESS_EN, ARCHER_PUSH_UP_EN]),
  },
};

export interface FakeCatalogFetch {
  readonly fetch: typeof fetch;
  /** Las URLs pedidas, en orden. Es lo que permite comprobar que se sincroniza un músculo por paso. */
  readonly calls: string[];
}

const MUSCLE_FILE_PATTERN = /\/api\/(?<locale>es|en)\/muscles\/(?<muscle>[a-z-]+)\.json$/;

/**
 * Un CDN de mentira que responde desde las fixtures. Cualquier URL que no reconozca
 * devuelve 404 en vez de salir a la red: si un test pidiese algo no previsto, se ve.
 */
export function createCatalogFetch(
  fixtures: CatalogSourceFixtures = DEFAULT_SOURCE_FIXTURES,
): FakeCatalogFetch {
  const calls: string[] = [];

  const fakeFetch: typeof fetch = (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);

    const groups = MUSCLE_FILE_PATTERN.exec(url)?.groups;
    const muscle = muscleSchema.safeParse(groups?.muscle);
    const locale = groups?.locale;

    if (!muscle.success || (locale !== 'es' && locale !== 'en')) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }

    const file = fixtures[muscle.data]?.[locale] ?? muscleFile(muscle.data, []);

    return Promise.resolve(Response.json(file));
  };

  return { fetch: fakeFetch, calls };
}

const SEEDED_SYNCED_AT = '2026-09-08T10:00:00.000Z';

/**
 * Siembra el snapshot directamente, sin pasar por la sincronización: los tests de las rutas
 * prueban las rutas, no el ciclo de descarga, y así no necesitan ni un `fetch` de mentira.
 * Las filas se construyen con el mismo código que usa la sincronización real, de modo que
 * lo sembrado no puede desviarse de lo que produciría el origen.
 */
export async function seedCatalogSnapshot(
  db: Database,
  fixtures: CatalogSourceFixtures = DEFAULT_SOURCE_FIXTURES,
): Promise<NewCatalogExerciseRow[]> {
  await db.delete(catalogSyncState);
  await db.delete(catalogExercise);

  const rows: NewCatalogExerciseRow[] = [];

  for (const muscle of muscleSchema.options) {
    const files = fixtures[muscle];
    if (files === undefined) continue;

    const built = buildCatalogRows({
      muscle,
      spanish: sourceMuscleFileSchema.parse(files.es ?? muscleFile(muscle, [])),
      english: sourceMuscleFileSchema.parse(files.en ?? muscleFile(muscle, [])),
      catalogVersion: 'v1.1.0',
      syncedAt: SEEDED_SYNCED_AT,
    });

    rows.push(...built.rows);
  }

  if (rows.length > 0) await db.insert(catalogExercise).values(rows);

  return rows;
}
