import type {
  BodyPartSummary,
  CatalogExercise,
  CatalogExercisePage,
  CatalogExerciseSummary,
  ExerciseHistory,
  ExerciseStats,
  PersonalRecord,
  Session,
  TrackedExercise,
  TrainingSignals,
  User,
  WorkoutSessionDetail,
  WorkoutSessionPage,
} from '@gymbuddy/shared';

export const user: User = {
  id: '4d2a6d9c-5c2e-4a7e-9b1d-3f6c8a2b1e01',
  telegramUserId: 123456789,
  firstName: 'Juan',
  username: 'juanmmm21',
  photoUrl: null,
  locale: 'es',
  unitSystem: 'metric',
  createdAt: '2026-09-01T10:00:00.000Z',
};

export const session: Session = {
  token: 'jwt-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user,
};

export const benchPress: TrackedExercise = {
  id: '7a1f0b3e-2d4c-4e5f-8a9b-0c1d2e3f4a5b',
  name: 'Press de banca',
  origin: 'catalog',
  catalogId: 'pectorals/barbell-bench-press',
  muscle: 'pectorals',
  bodyPart: 'chest',
  gifUrl: 'https://cdn.jsdelivr.net/gh/x/y@v1.1.0/pectorals/barbell-bench-press.gif',
  notes: null,
  workingWeight: {
    weight: '82.50',
    reps: 8,
    lastPerformedAt: '2026-09-06T18:00:00.000Z',
    sessionCount: 5,
  },
  createdAt: '2026-08-01T10:00:00.000Z',
  archivedAt: null,
};

export const customCurl: TrackedExercise = {
  id: '8b2f1c4f-3e5d-4f60-9bac-1d2e3f4a5b6c',
  name: 'Curl con la barra rara',
  origin: 'custom',
  catalogId: null,
  muscle: null,
  bodyPart: 'arms',
  gifUrl: null,
  notes: null,
  workingWeight: null,
  createdAt: '2026-08-02T10:00:00.000Z',
  archivedAt: null,
};

export const signals: TrainingSignals = {
  generatedAt: '2026-09-08T12:00:00.000Z',
  lastSessionAt: '2026-09-06T18:00:00.000Z',
  daysSinceLastSession: 1,
  weeklyStreak: 3,
  sessionsThisWeek: 1,
  activeSessionId: null,
  latestRecord: {
    id: '9c3a2d5e-4f6a-4b71-8cbd-2e3f4a5b6c7d',
    trackedExerciseId: benchPress.id,
    kind: 'max_weight',
    value: '85.00',
    setEntryId: 'ad4b3e6f-5a7b-4c82-9dce-3f4a5b6c7d8e',
    achievedAt: '2026-09-06T18:20:00.000Z',
  },
  stalled: [],
};

export const bodyParts: BodyPartSummary[] = [
  { bodyPart: 'arms', exerciseCount: 329 },
  { bodyPart: 'chest', exerciseCount: 163 },
];

const CDN = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0';

/** Resumen tal como lo lista el catálogo: sin instrucciones ni categoría. */
export const catalogBenchPress: CatalogExerciseSummary = {
  catalogId: 'pectorals/barbell-bench-press',
  name: 'Press de banca con barra',
  muscle: 'pectorals',
  bodyPart: 'chest',
  equipment: 'barbell',
  gifUrl: `${CDN}/pectorals/barbell-bench-press.gif`,
};

export const catalogArcherPushUp: CatalogExerciseSummary = {
  catalogId: 'pectorals/archer-push-up',
  name: 'Flexión del arquero',
  muscle: 'pectorals',
  bodyPart: 'chest',
  equipment: 'bodyweight',
  gifUrl: `${CDN}/pectorals/archer-push-up.gif`,
};

/** La ficha completa del press de banca, con lo que pinta la pantalla de detalle. */
export const catalogBenchPressDetail: CatalogExercise = {
  ...catalogBenchPress,
  category: 'strength',
  secondaryMuscles: ['triceps', 'delts'],
  instructions: [
    'Carga el peso adecuado en la barra y adopta la postura inicial.',
    'Activa el pectoral antes de iniciar el movimiento.',
    'Vuelve a la posición inicial controlando la fase excéntrica.',
  ],
  syncedAt: '2026-09-08T06:00:00.000Z',
};

/** Genera `count` resúmenes distintos para probar la paginación sin escribirlos a mano. */
export function catalogSummaries(count: number, offset = 0): CatalogExerciseSummary[] {
  return Array.from({ length: count }, (_, index) => {
    const number = offset + index + 1;
    return {
      ...catalogArcherPushUp,
      catalogId: `pectorals/exercise-${String(number)}`,
      name: `Ejercicio de pecho ${String(number)}`,
    };
  });
}

export function catalogPage(
  items: CatalogExerciseSummary[],
  total: number,
  offset = 0,
  limit = 50,
): CatalogExercisePage {
  return { items, total, limit, offset };
}

export const sessionPage: WorkoutSessionPage = {
  items: [
    {
      id: 'be5c4f7a-6b8c-4d93-aedf-4a5b6c7d8e9f',
      startedAt: '2026-09-06T18:00:00.000Z',
      endedAt: '2026-09-06T19:05:00.000Z',
      notes: null,
      source: 'web',
      setCount: 12,
    },
  ],
  total: 1,
  limit: 20,
  offset: 0,
};

/** Una sentadilla seguida del catálogo, para que haya dos grupos en "mis ejercicios". */
export const squat: TrackedExercise = {
  id: '9d3e2f50-4a6b-4c71-8bcd-2e3f4a5b6c7d',
  name: 'Sentadilla con barra',
  origin: 'catalog',
  catalogId: 'quads/barbell-full-squat',
  muscle: 'quads',
  bodyPart: 'legs',
  gifUrl: 'https://cdn.jsdelivr.net/gh/x/y@v1.1.0/quads/barbell-full-squat.gif',
  notes: 'Barra baja, mirada al frente.',
  workingWeight: {
    weight: '100.00',
    reps: 5,
    lastPerformedAt: '2026-09-04T18:00:00.000Z',
    sessionCount: 1,
  },
  createdAt: '2026-08-03T10:00:00.000Z',
  archivedAt: null,
};

/**
 * Una sesión abierta con una serie de press de banca ya registrada. La fecha está en el
 * pasado a propósito: el descanso sale cumplido y el cronómetro no depende del reloj.
 */
export const activeSession: WorkoutSessionDetail = {
  id: 'e19a7b3c-4d5e-4f61-9a2b-3c4d5e6f7a8b',
  startedAt: '2026-09-08T18:00:00.000Z',
  endedAt: null,
  notes: null,
  source: 'web',
  sets: [
    {
      id: 'f2ab8c4d-5e6f-4a72-8b3c-4d5e6f7a8b9c',
      trackedExerciseId: benchPress.id,
      orderIndex: 0,
      weight: '82.50',
      reps: 8,
      rpe: null,
      isWarmup: false,
      completedAt: '2026-09-08T18:10:00.000Z',
      source: 'web',
    },
  ],
};

/** La marca que devuelve `POST /sessions/{id}/sets` al superar el peso máximo. */
export const newMaxWeightRecord: PersonalRecord = {
  id: '03bc9d5e-6f7a-4b83-9c4d-5e6f7a8b9c0d',
  trackedExerciseId: benchPress.id,
  kind: 'max_weight',
  value: '90.00',
  setEntryId: '14cdae6f-7a8b-4c94-ad5e-6f7a8b9c0d1e',
  achievedAt: '2026-09-08T18:20:00.000Z',
};

/** Cómo va el press de banca: peso habitual, dos marcas y estancado. */
export const benchPressStats: ExerciseStats = {
  trackedExerciseId: benchPress.id,
  workingWeight: benchPress.workingWeight,
  records: [
    {
      id: '9c3a2d5e-4f6a-4b71-8cbd-2e3f4a5b6c7d',
      trackedExerciseId: benchPress.id,
      kind: 'max_weight',
      value: '85.00',
      setEntryId: 'ad4b3e6f-5a7b-4c82-9dce-3f4a5b6c7d8e',
      achievedAt: '2026-09-06T18:20:00.000Z',
    },
    {
      id: 'ae4b3e6f-5a7b-4c82-9dce-3f4a5b6c7d8f',
      trackedExerciseId: benchPress.id,
      kind: 'estimated_1rm',
      value: '104.50',
      setEntryId: 'bf5c4f70-6b8c-4d93-aedf-4a5b6c7d8e90',
      achievedAt: '2026-08-30T18:20:00.000Z',
    },
  ],
  points: [],
  stalled: {
    trackedExerciseId: benchPress.id,
    weight: '82.50',
    sessions: 3,
    suggestedIncrement: '2.50',
  },
};

/** Las dos últimas veces que se hizo press de banca, con calentamiento y RPE. */
export const benchPressHistory: ExerciseHistory = {
  trackedExerciseId: benchPress.id,
  sessions: [
    {
      sessionId: 'be5c4f7a-6b8c-4d93-aedf-4a5b6c7d8e9f',
      startedAt: '2026-09-06T18:00:00.000Z',
      endedAt: '2026-09-06T19:05:00.000Z',
      sets: [
        {
          id: 'c06d5081-7c9d-4ea4-bfe0-5b6c7d8e9fa1',
          trackedExerciseId: benchPress.id,
          orderIndex: 0,
          weight: '60.00',
          reps: 10,
          rpe: null,
          isWarmup: true,
          completedAt: '2026-09-06T18:05:00.000Z',
          source: 'web',
        },
        {
          id: 'ad4b3e6f-5a7b-4c82-9dce-3f4a5b6c7d8e',
          trackedExerciseId: benchPress.id,
          orderIndex: 1,
          weight: '85.00',
          reps: 6,
          rpe: 8.5,
          isWarmup: false,
          completedAt: '2026-09-06T18:20:00.000Z',
          source: 'web',
        },
      ],
    },
    {
      sessionId: 'cf6e6192-8dae-4fb5-a0f1-6c7d8e9fa1b2',
      startedAt: '2026-09-03T18:00:00.000Z',
      endedAt: '2026-09-03T19:00:00.000Z',
      sets: [
        {
          id: 'd07f72a3-9ebf-40c6-b102-7d8e9fa1b2c3',
          trackedExerciseId: benchPress.id,
          orderIndex: 0,
          weight: '82.50',
          reps: 8,
          rpe: null,
          isWarmup: false,
          completedAt: '2026-09-03T18:20:00.000Z',
          source: 'bot',
        },
      ],
    },
  ],
};
