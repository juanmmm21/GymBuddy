import { describe, expect, it } from 'vitest';
import {
  MAX_IMPORT_EXERCISES_PER_BATCH,
  MAX_IMPORT_ROWS_PER_BATCH,
  MAX_IMPORT_SESSIONS_PER_BATCH,
  deriveImportedId,
  deriveImportedIds,
  findCatalogConflicts,
  importedIdOf,
  importedSessionEndedAt,
  planImport,
  sessionImportRows,
} from '../src/domain/index';
import {
  apiErrorCodeSchema,
  importExercisesRequestSchema,
  importRoutinesRequestSchema,
  importSessionsRequestSchema,
  resourceIdSchema,
  type ExportedExercise,
  type ExportedRoutine,
  type ExportedSession,
  type ExportedSet,
} from '../src/schemas/index';

const USER_ID = '2d7f3a91-5c4b-4e08-9a1f-6b3c8d2e7f40';
const OTHER_USER_ID = '9e4c1b27-8a3d-4f56-b0e9-1d2c3b4a5f68';
const BENCH_ID = '3f6c2b1a-58e6-4c65-9d0e-2b1a4c7f8d31';
const PLANK_ID = '5e1d9c47-2a3b-4f60-8d7e-9c0b1a2f3e44';

/** Un UUID v4 distinto por posición, para fabricar muchas filas sin repetir. */
function idAt(prefix: string, index: number): string {
  return `${prefix}-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function exercise(overrides: Partial<ExportedExercise> = {}): ExportedExercise {
  return {
    id: BENCH_ID,
    origin: 'catalog',
    catalogId: 'pectorals/barbell-bench-press',
    name: 'Press de banca',
    muscle: 'pectorals',
    bodyPart: 'chest',
    notes: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    archivedAt: null,
    ...overrides,
  };
}

function customExercise(index: number): ExportedExercise {
  return exercise({
    id: idAt('aaaaaaaa', index),
    origin: 'custom',
    catalogId: null,
    name: `Ejercicio ${String(index)}`,
  });
}

function set(index: number, completedAt: string, records = 0): ExportedSet {
  return {
    id: idAt('bbbbbbbb', index),
    trackedExerciseId: BENCH_ID,
    orderIndex: index,
    weight: '82.50',
    reps: 8,
    rpe: null,
    isWarmup: false,
    completedAt,
    records: Array.from({ length: records }, (_unused, recordIndex) => ({
      id: idAt('cccccccc', index * 10 + recordIndex),
      kind: 'max_weight' as const,
      value: '82.50',
      achievedAt: completedAt,
    })),
  };
}

function session(index: number, sets: ExportedSet[] = []): ExportedSession {
  return {
    id: idAt('dddddddd', index),
    startedAt: '2026-09-04T18:00:00.000Z',
    endedAt: '2026-09-04T19:00:00.000Z',
    notes: null,
    sets,
  };
}

function setsFor(count: number): ExportedSet[] {
  return Array.from({ length: count }, (_unused, index) => set(index, '2026-09-04T18:10:00.000Z'));
}

function routine(index: number, items: number): ExportedRoutine {
  return {
    id: idAt('eeeeeeee', index),
    name: `Rutina ${String(index)}`,
    description: null,
    createdAt: '2026-09-03T08:00:00.000Z',
    archivedAt: null,
    items: Array.from({ length: items }, (_unused, itemIndex) => ({
      id: idAt('ffffffff', index * 100 + itemIndex),
      trackedExerciseId: BENCH_ID,
      orderIndex: itemIndex,
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 10,
    })),
  };
}

describe('deriveImportedId', () => {
  it('da siempre el mismo id para el mismo usuario y la misma fila: reimportar no duplica', async () => {
    const first = await deriveImportedId(USER_ID, BENCH_ID);
    const second = await deriveImportedId(USER_ID, BENCH_ID);

    expect(first).toBe(second);
  });

  it('da otro id en otra cuenta: no choca con la cuenta que exportó, que puede seguir existiendo', async () => {
    const mine = await deriveImportedId(USER_ID, BENCH_ID);
    const theirs = await deriveImportedId(OTHER_USER_ID, BENCH_ID);

    expect(mine).not.toBe(theirs);
    expect(mine).not.toBe(BENCH_ID);
  });

  it('filas distintas no comparten id', async () => {
    expect(await deriveImportedId(USER_ID, BENCH_ID)).not.toBe(
      await deriveImportedId(USER_ID, PLANK_ID),
    );
  });

  it('es un UUID de versión 8 que el contrato acepta como identificador', async () => {
    const id = await deriveImportedId(USER_ID, BENCH_ID);

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(resourceIdSchema.safeParse(id).success).toBe(true);
  });
});

describe('deriveImportedIds', () => {
  it('deriva cada id una vez y coincide con el cálculo suelto', async () => {
    const ids = await deriveImportedIds(USER_ID, [BENCH_ID, PLANK_ID, BENCH_ID]);

    expect(ids.size).toBe(2);
    expect(ids.get(BENCH_ID)).toBe(await deriveImportedId(USER_ID, BENCH_ID));
    expect(ids.get(PLANK_ID)).toBe(await deriveImportedId(USER_ID, PLANK_ID));
  });

  it('importedIdOf falla en voz alta si falta un id: sería escribir una fila sin referencia', async () => {
    const ids = await deriveImportedIds(USER_ID, [BENCH_ID]);

    expect(importedIdOf(ids, BENCH_ID)).toBe(ids.get(BENCH_ID));
    expect(() => importedIdOf(ids, PLANK_ID)).toThrow(PLANK_ID);
  });
});

describe('importedSessionEndedAt', () => {
  it('una sesión cerrada conserva su hora de cierre', () => {
    expect(importedSessionEndedAt(session(0))).toBe('2026-09-04T19:00:00.000Z');
  });

  it('una sesión abierta se cierra a la hora de su última serie, comparando instantes', () => {
    const open = {
      ...session(0, [
        set(0, '2026-09-04T18:40:00.000Z'),
        // Las 13:50 en -05:00 son las 18:50 UTC: como texto parecería anterior a las 18:40.
        set(1, '2026-09-04T13:50:00-05:00'),
        set(2, '2026-09-04T18:20:00.000Z'),
      ]),
      endedAt: null,
    };

    expect(importedSessionEndedAt(open)).toBe('2026-09-04T13:50:00-05:00');
  });

  it('una sesión abierta sin series se cierra a la hora en que empezó', () => {
    expect(importedSessionEndedAt({ ...session(0), endedAt: null })).toBe(
      '2026-09-04T18:00:00.000Z',
    );
  });
});

describe('planImport', () => {
  it('un fichero vacío no pide nada', () => {
    expect(planImport({ exercises: [], routines: [], sessions: [] })).toEqual({
      exercises: [],
      routines: [],
      sessions: [],
      oversized: [],
    });
  });

  it('reparte los ejercicios de cincuenta en cincuenta, sin cambiar el orden', () => {
    const exercises = Array.from({ length: MAX_IMPORT_EXERCISES_PER_BATCH + 3 }, (_unused, index) =>
      customExercise(index),
    );

    const plan = planImport({ exercises, routines: [], sessions: [] });

    expect(plan.exercises.map((batch) => batch.length)).toEqual([
      MAX_IMPORT_EXERCISES_PER_BATCH,
      3,
    ]);
    expect(plan.exercises.flat()).toEqual(exercises);
  });

  it('corta las sesiones por número aunque sobren filas', () => {
    const sessions = Array.from({ length: MAX_IMPORT_SESSIONS_PER_BATCH + 1 }, (_unused, index) =>
      session(index),
    );

    const plan = planImport({ exercises: [], routines: [], sessions });

    expect(plan.sessions.map((batch) => batch.length)).toEqual([MAX_IMPORT_SESSIONS_PER_BATCH, 1]);
  });

  it('corta las sesiones por filas: series y marcas cuentan', () => {
    const heavy = session(0, [...setsFor(99), set(99, '2026-09-04T18:10:00.000Z', 2)]);
    expect(sessionImportRows(heavy)).toBe(103);

    const plan = planImport({
      exercises: [],
      routines: [],
      sessions: [
        heavy,
        { ...heavy, id: idAt('dddddddd', 1) },
        { ...heavy, id: idAt('dddddddd', 2) },
      ],
    });

    expect(plan.sessions.map((batch) => batch.length)).toEqual([2, 1]);
    for (const batch of plan.sessions) {
      const rows = batch.reduce((total, entry) => total + sessionImportRows(entry), 0);
      expect(rows).toBeLessThanOrEqual(MAX_IMPORT_ROWS_PER_BATCH);
    }
  });

  it('una sesión que por sí sola no cabe en una petición se señala y no entra en ningún lote', () => {
    const huge = session(0, setsFor(MAX_IMPORT_ROWS_PER_BATCH));
    const normal = session(1, setsFor(3));

    const plan = planImport({ exercises: [], routines: [routine(0, 2)], sessions: [huge, normal] });

    expect(plan.oversized).toEqual([
      { kind: 'session', id: huge.id, rows: MAX_IMPORT_ROWS_PER_BATCH + 1 },
    ]);
    expect(plan.sessions).toEqual([[normal]]);
    expect(plan.routines).toEqual([[routine(0, 2)]]);
  });
});

describe('findCatalogConflicts', () => {
  const fileExercises = [exercise(), customExercise(0)];

  it('una cuenta vacía no choca con nada', async () => {
    const ids = await deriveImportedIds(USER_ID, [BENCH_ID]);

    expect(findCatalogConflicts(fileExercises, [], ids)).toEqual([]);
  });

  it('el mismo ejercicio del catálogo ya seguido con otra ficha choca', async () => {
    const ids = await deriveImportedIds(USER_ID, [BENCH_ID]);
    const account = [{ id: PLANK_ID, catalogId: 'pectorals/barbell-bench-press' }];

    expect(findCatalogConflicts(fileExercises, account, ids)).toEqual([
      'pectorals/barbell-bench-press',
    ]);
  });

  it('la ficha que ya importó este mismo fichero no choca: es reanudar', async () => {
    const ids = await deriveImportedIds(USER_ID, [BENCH_ID]);
    const account = [
      { id: importedIdOf(ids, BENCH_ID), catalogId: 'pectorals/barbell-bench-press' },
    ];

    expect(findCatalogConflicts(fileExercises, account, ids)).toEqual([]);
  });

  it('los propios nunca chocan, aunque se llamen igual', async () => {
    const ids = await deriveImportedIds(USER_ID, [BENCH_ID]);
    const account = [{ id: PLANK_ID, catalogId: null }];

    expect(findCatalogConflicts([customExercise(0)], account, ids)).toEqual([]);
  });
});

describe('peticiones de importación', () => {
  it('los ejercicios van en lotes de uno a cincuenta', () => {
    expect(importExercisesRequestSchema.safeParse({ exercises: [] }).success).toBe(false);
    expect(importExercisesRequestSchema.safeParse({ exercises: [exercise()] }).success).toBe(true);

    const tooMany = Array.from({ length: MAX_IMPORT_EXERCISES_PER_BATCH + 1 }, (_unused, index) =>
      customExercise(index),
    );
    expect(importExercisesRequestSchema.safeParse({ exercises: tooMany }).success).toBe(false);
  });

  it('rechaza el mismo ejercicio del catálogo dos veces en una petición', () => {
    const twice = [exercise(), exercise({ id: PLANK_ID })];

    expect(importExercisesRequestSchema.safeParse({ exercises: twice }).success).toBe(false);
  });

  it('rechaza sesiones o rutinas que pasan del tope de filas', () => {
    const fits = [session(0, setsFor(100)), session(1, setsFor(100))];
    const overflows = [...fits, session(2, setsFor(100))];

    expect(importSessionsRequestSchema.safeParse({ sessions: fits }).success).toBe(true);
    expect(importSessionsRequestSchema.safeParse({ sessions: overflows }).success).toBe(false);

    expect(importRoutinesRequestSchema.safeParse({ routines: [routine(0, 30)] }).success).toBe(
      true,
    );
    expect(
      importRoutinesRequestSchema.safeParse({
        routines: Array.from({ length: 9 }, (_unused, index) => routine(index, 30)),
      }).success,
    ).toBe(false);
  });

  it('el choque con un ejercicio ya seguido tiene su propio código de error', () => {
    expect(apiErrorCodeSchema.safeParse('import_conflict').success).toBe(true);
  });
});
