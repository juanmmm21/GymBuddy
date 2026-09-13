import { describe, expect, it } from 'vitest';
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  buildExportFile,
  exportFileSchema,
  exportSessionPageSchema,
  exportedExerciseSchema,
  exportedRoutineItemSchema,
  type ExportSnapshot,
  type ExportedSession,
} from '../src/schemas/index';

const BENCH_ID = '3f6c2b1a-58e6-4c65-9d0e-2b1a4c7f8d31';
const PLANK_ID = '5e1d9c47-2a3b-4f60-8d7e-9c0b1a2f3e44';
const SESSION_ID = 'a0c14d2f-9b7e-4a11-8f3c-6d5e2a9b0c74';
const SET_ID = 'd41f7b90-3c22-4e58-9a6b-1f0c8e7d5a23';
const RECORD_ID = 'f2a8c3d1-7b64-4e09-a5c1-8d3e6b0f9a17';
const ROUTINE_ID = '8b2e5c07-6a41-4d93-b7f8-0c3a1e6d9b52';
const ROUTINE_ITEM_ID = 'c7d90a12-4e83-4b60-95af-31d2e8c74b06';
const UNKNOWN_ID = '0b9e7d65-4c3a-4b21-9f8e-7d6c5b4a3f21';

function snapshot(): ExportSnapshot {
  return {
    exportedAt: '2026-09-13T10:00:00.000Z',
    profile: { displayName: 'Juan', locale: 'es', unitSystem: 'metric' },
    exercises: [
      {
        id: BENCH_ID,
        origin: 'catalog',
        catalogId: 'pectorals/barbell-bench-press',
        name: 'Press de banca',
        muscle: 'pectorals',
        bodyPart: 'chest',
        notes: 'Agarre medio',
        createdAt: '2026-09-01T08:00:00.000Z',
        archivedAt: null,
      },
      {
        id: PLANK_ID,
        origin: 'custom',
        catalogId: null,
        name: 'Plancha con disco',
        muscle: null,
        bodyPart: null,
        notes: null,
        createdAt: '2026-09-02T08:00:00.000Z',
        archivedAt: '2026-09-10T08:00:00.000Z',
      },
    ],
    routines: [
      {
        id: ROUTINE_ID,
        name: 'Empuje',
        description: null,
        createdAt: '2026-09-03T08:00:00.000Z',
        archivedAt: null,
        items: [
          {
            id: ROUTINE_ITEM_ID,
            trackedExerciseId: BENCH_ID,
            orderIndex: 0,
            targetSets: 4,
            targetRepsMin: 6,
            targetRepsMax: 8,
          },
        ],
      },
    ],
  };
}

function session(): ExportedSession {
  return {
    id: SESSION_ID,
    startedAt: '2026-09-04T18:00:00.000Z',
    endedAt: '2026-09-04T19:05:00.000Z',
    notes: null,
    sets: [
      {
        id: SET_ID,
        trackedExerciseId: BENCH_ID,
        orderIndex: 0,
        weight: '82.50',
        reps: 8,
        rpe: 8.5,
        isWarmup: false,
        completedAt: '2026-09-04T18:10:00.000Z',
        records: [
          {
            id: RECORD_ID,
            kind: 'max_weight',
            value: '82.50',
            achievedAt: '2026-09-04T18:10:00.000Z',
          },
        ],
      },
    ],
  };
}

describe('fichero de exportación', () => {
  it('buildExportFile pone la marca y la versión y deja un fichero válido', () => {
    const file = buildExportFile(snapshot(), [session()]);

    expect(file.format).toBe(EXPORT_FORMAT);
    expect(file.version).toBe(EXPORT_VERSION);
    expect(file.exportedAt).toBe('2026-09-13T10:00:00.000Z');
    expect(exportFileSchema.parse(file)).toEqual(file);
  });

  it('sobrevive a pasar por JSON: es lo que se descarga y lo que se volverá a leer', () => {
    const file = buildExportFile(snapshot(), [session()]);

    const reread = exportFileSchema.parse(JSON.parse(JSON.stringify(file)));

    expect(reread).toEqual(file);
  });

  it('una cuenta sin nada que exportar sigue siendo un fichero válido', () => {
    const empty = buildExportFile({ ...snapshot(), exercises: [], routines: [] }, []);

    expect(exportFileSchema.safeParse(empty).success).toBe(true);
  });

  it('rechaza otra versión o un fichero que no es de GymBuddy', () => {
    const file = buildExportFile(snapshot(), [session()]);

    expect(exportFileSchema.safeParse({ ...file, version: EXPORT_VERSION + 1 }).success).toBe(
      false,
    );
    expect(exportFileSchema.safeParse({ ...file, format: 'otra-app' }).success).toBe(false);
  });

  it('los pesos van como en la API, nunca como número', () => {
    const file = buildExportFile(snapshot(), [session()]);
    const withNumber = JSON.parse(JSON.stringify(file)) as {
      sessions: { sets: { weight: unknown }[] }[];
    };
    const firstSet = withNumber.sessions[0]?.sets[0];
    if (firstSet === undefined) throw new Error('La fixture no tiene series');
    firstSet.weight = 82.5;

    expect(exportFileSchema.safeParse(withNumber).success).toBe(false);
  });

  it('rechaza una serie que nombra un ejercicio que el fichero no trae', () => {
    const orphan = session();
    const firstSet = orphan.sets[0];
    if (firstSet === undefined) throw new Error('La fixture no tiene series');
    orphan.sets = [{ ...firstSet, trackedExerciseId: UNKNOWN_ID }];

    const result = exportFileSchema.safeParse(buildExportFile(snapshot(), [orphan]));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['sessions', 0, 'sets', 0, 'trackedExerciseId']);
  });

  it('rechaza una línea de rutina que nombra un ejercicio que el fichero no trae', () => {
    const base = snapshot();
    const orphanRoutines = base.routines.map((routine) => ({
      ...routine,
      items: routine.items.map((item) => ({ ...item, trackedExerciseId: UNKNOWN_ID })),
    }));

    const result = exportFileSchema.safeParse(
      buildExportFile({ ...base, routines: orphanRoutines }, []),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['routines', 0, 'items', 0, 'trackedExerciseId']);
  });

  it('rechaza un identificador repetido dentro de la misma tabla', () => {
    const repeated = { ...session(), startedAt: '2026-09-05T18:00:00.000Z', sets: [] };

    const result = exportFileSchema.safeParse(buildExportFile(snapshot(), [session(), repeated]));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['sessions', 1, 'id']);
  });

  it('acepta el mismo identificador en tablas distintas, como hace la base', () => {
    const shared = { ...session(), id: BENCH_ID };

    expect(exportFileSchema.safeParse(buildExportFile(snapshot(), [shared])).success).toBe(true);
  });

  it('rechaza seguir dos veces el mismo ejercicio del catálogo', () => {
    const base = snapshot();
    const bench = base.exercises[0];
    if (bench === undefined) throw new Error('La fixture no tiene ejercicios');
    const twice = { ...base, exercises: [bench, { ...bench, id: UNKNOWN_ID }] };

    const result = exportFileSchema.safeParse(buildExportFile(twice, []));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['exercises', 1, 'catalogId']);
  });
});

describe('piezas de la exportación', () => {
  it('un ejercicio del catálogo lleva catalogId y uno propio no', () => {
    const bench = snapshot().exercises[0];
    const plank = snapshot().exercises[1];
    if (bench === undefined || plank === undefined) throw new Error('Faltan fixtures');

    expect(exportedExerciseSchema.safeParse({ ...bench, catalogId: null }).success).toBe(false);
    expect(exportedExerciseSchema.safeParse({ ...plank, catalogId: 'abs/crunch' }).success).toBe(
      false,
    );
  });

  it('una línea de rutina no admite el rango invertido', () => {
    const item = snapshot().routines[0]?.items[0];
    if (item === undefined) throw new Error('La fixture no tiene líneas');

    const result = exportedRoutineItemSchema.safeParse({
      ...item,
      targetRepsMin: 10,
      targetRepsMax: 8,
    });

    expect(result.success).toBe(false);
  });

  it('una página de sesiones tiene la forma de las demás páginas del contrato', () => {
    const page = { items: [session()], total: 1, limit: 50, offset: 0 };

    expect(exportSessionPageSchema.parse(page)).toEqual(page);
  });
});
