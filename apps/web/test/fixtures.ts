import type {
  BodyPartSummary,
  Session,
  TrackedExercise,
  TrainingSignals,
  User,
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
