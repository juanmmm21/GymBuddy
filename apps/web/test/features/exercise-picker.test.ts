import type { RoutineItem, StrengthSetEntry, TrackedExercise } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import {
  exerciseInitials,
  exercisePickerSections,
  matchesPickerFilter,
  NO_PICKER_FILTER,
  NO_SETS_LABEL,
  pickerBodyParts,
  pickerRowDetail,
  ROUTINE_SECTION_TITLE,
  sameBodyPartTitle,
} from '../../src/features/session/exercise-picker';
import { routineProgress } from '../../src/features/session/routine-progress';
import { benchPress, customCurl, squat } from '../fixtures';

const inclinePress: TrackedExercise = {
  ...benchPress,
  id: '5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f',
  name: 'Press inclinado con mancuernas',
  catalogId: 'pectorals/dumbbell-incline-bench-press',
  equipment: 'dumbbell',
  unilateral: true,
  lastSet: { weight: '26.00', reps: 10, completedAt: '2026-09-06T18:50:00.000Z' },
};

const treadmill: TrackedExercise = {
  ...benchPress,
  id: '6d7e8f9a-0b1c-4d2e-9f3a-4b5c6d7e8f9a',
  name: 'Cinta de correr',
  muscle: 'cardio',
  bodyPart: 'cardio',
  equipment: 'machine',
  lastSet: null,
  lastCardioSet: {
    durationSeconds: 1500,
    distanceMeters: 5200,
    completedAt: '2026-09-06T19:30:00.000Z',
  },
};

const unclassified: TrackedExercise = {
  ...customCurl,
  id: '7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b',
  name: 'Mi invento',
  bodyPart: null,
};

const ALL = [benchPress, squat, customCurl, inclinePress, treadmill];

function itemOf(id: string, trackedExerciseId: string, orderIndex: number): RoutineItem {
  return { id, trackedExerciseId, orderIndex, targetSets: 2, targetRepsMin: 8, targetRepsMax: 12 };
}

function setOf(trackedExerciseId: string, orderIndex: number): StrengthSetEntry {
  return {
    id: `40000000-0000-4000-8000-${String(orderIndex).padStart(12, '0')}`,
    kind: 'strength',
    trackedExerciseId,
    orderIndex,
    weight: '82.50',
    reps: 8,
    rpe: null,
    isWarmup: false,
    completedAt: '2026-09-16T18:00:00.000Z',
  };
}

function namesBySection(sections: ReturnType<typeof exercisePickerSections>): [string, string[]][] {
  return sections.map((section) => [section.title, section.rows.map((row) => row.exercise.name)]);
}

describe('exercisePickerSections', () => {
  it('sin rutina, arriba van los de la misma parte del cuerpo que el elegido y debajo el resto', () => {
    const sections = exercisePickerSections(ALL, {
      routineProgress: null,
      selected: benchPress,
      filter: NO_PICKER_FILTER,
    });

    expect(namesBySection(sections)).toEqual([
      [sameBodyPartTitle('chest'), ['Press de banca', 'Press inclinado con mancuernas']],
      ['Piernas', ['Sentadilla con barra']],
      ['Brazos', ['Curl con la barra rara']],
      ['Cardio', ['Cinta de correr']],
    ]);
    expect(sections[0]?.title).toBe('Mismo grupo: Pecho');
  });

  it('sin rutina y con un elegido sin parte del cuerpo, no hay sección de arriba', () => {
    const sections = exercisePickerSections([benchPress, unclassified], {
      routineProgress: null,
      selected: unclassified,
      filter: NO_PICKER_FILTER,
    });

    expect(namesBySection(sections)).toEqual([
      ['Pecho', ['Press de banca']],
      ['Sin clasificar', ['Mi invento']],
    ]);
  });

  it('con rutina, arriba van sus ejercicios en orden: el que toca, los hechos y los pendientes', () => {
    const items = [
      itemOf('20000000-0000-4000-8000-000000000001', benchPress.id, 0),
      itemOf('20000000-0000-4000-8000-000000000002', inclinePress.id, 1),
      itemOf('20000000-0000-4000-8000-000000000003', squat.id, 2),
    ];
    const progress = routineProgress(items, [setOf(benchPress.id, 0), setOf(benchPress.id, 1)]);

    const sections = exercisePickerSections(ALL, {
      routineProgress: progress,
      selected: inclinePress,
      filter: NO_PICKER_FILTER,
    });

    expect(namesBySection(sections)).toEqual([
      [
        ROUTINE_SECTION_TITLE,
        ['Press de banca', 'Press inclinado con mancuernas', 'Sentadilla con barra'],
      ],
      ['Brazos', ['Curl con la barra rara']],
      ['Cardio', ['Cinta de correr']],
    ]);
    expect(sections[0]?.rows.map((row) => row.status)).toEqual(['done', 'current', 'pending']);
  });

  it('un ejercicio en dos bloques sale una vez y solo está hecho cuando lo están los dos', () => {
    const items = [
      itemOf('20000000-0000-4000-8000-000000000001', benchPress.id, 0),
      itemOf('20000000-0000-4000-8000-000000000002', squat.id, 1),
      itemOf('20000000-0000-4000-8000-000000000003', benchPress.id, 2),
    ];
    const progress = routineProgress(items, [
      setOf(benchPress.id, 0),
      setOf(benchPress.id, 1),
      setOf(squat.id, 2),
    ]);

    const [routine] = exercisePickerSections(ALL, {
      routineProgress: progress,
      selected: squat,
      filter: NO_PICKER_FILTER,
    });

    expect(routine?.rows.map((row) => [row.exercise.name, row.status])).toEqual([
      ['Press de banca', 'pending'],
      ['Sentadilla con barra', 'current'],
    ]);
  });

  it('el buscador y la parte del cuerpo filtran todas las secciones y quitan las vacías', () => {
    expect(
      namesBySection(
        exercisePickerSections(ALL, {
          routineProgress: null,
          selected: benchPress,
          filter: { text: 'INCLINADO', bodyPart: null },
        }),
      ),
    ).toEqual([[sameBodyPartTitle('chest'), ['Press inclinado con mancuernas']]]);

    expect(
      namesBySection(
        exercisePickerSections(ALL, {
          routineProgress: null,
          selected: benchPress,
          filter: { text: '', bodyPart: 'legs' },
        }),
      ),
    ).toEqual([['Piernas', ['Sentadilla con barra']]]);

    expect(
      exercisePickerSections(ALL, {
        routineProgress: null,
        selected: benchPress,
        filter: { text: 'remo', bodyPart: null },
      }),
    ).toEqual([]);
  });
});

describe('matchesPickerFilter', () => {
  it('casa cada palabra en cualquier orden, sin mayúsculas ni tildes', () => {
    const match = (text: string): boolean =>
      matchesPickerFilter(inclinePress, { text, bodyPart: null });

    expect(match('mancuernas press')).toBe(true);
    expect(match('  incl  ')).toBe(true);
    expect(match('mancuérnas')).toBe(true);
    expect(match('press barra')).toBe(false);
    expect(match('')).toBe(true);
  });
});

describe('pickerBodyParts', () => {
  it('solo las partes con algún ejercicio, en el orden del catálogo', () => {
    expect(pickerBodyParts([treadmill, customCurl, squat, benchPress, unclassified])).toEqual([
      'chest',
      'legs',
      'arms',
      'cardio',
    ]);
  });
});

describe('pickerRowDetail', () => {
  it('la última serie de hoy manda sobre la de otro día', () => {
    expect(pickerRowDetail(benchPress, [], 'es')).toBe('Pecho · 80 kg × 6');
    expect(pickerRowDetail(benchPress, [setOf(benchPress.id, 0)], 'es')).toBe(
      'Pecho · 82,5 kg × 8',
    );
  });

  it('dice «por brazo» en uno a un brazo, el tiempo en cardio y si no hay series', () => {
    expect(pickerRowDetail(inclinePress, [], 'es')).toBe('Pecho · 26 kg por brazo × 10');
    expect(pickerRowDetail(treadmill, [], 'es')).toBe('Cardio · 25 min · 5,2 km');
    expect(pickerRowDetail(customCurl, [], 'es')).toBe(`Brazos · ${NO_SETS_LABEL}`);
  });

  it('marca un archivado y un propio sin clasificar', () => {
    const archived = { ...squat, archivedAt: '2026-09-10T10:00:00.000Z' };
    expect(pickerRowDetail(archived, [], 'es')).toBe('Piernas · 100 kg × 5 · archivado');
    expect(pickerRowDetail(unclassified, [], 'es')).toBe(`Sin clasificar · ${NO_SETS_LABEL}`);
  });
});

describe('exerciseInitials', () => {
  it('toma las dos primeras palabras con significado', () => {
    expect(exerciseInitials('Curl con la barra rara')).toBe('CB');
    expect(exerciseInitials('press de banca')).toBe('PB');
    expect(exerciseInitials('Dominadas')).toBe('D');
    expect(exerciseInitials('Ab en rueda')).toBe('R');
    expect(exerciseInitials('21s')).toBe('2');
  });
});
