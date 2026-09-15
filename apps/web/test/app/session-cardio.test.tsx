import type {
  CardioSetEntry,
  LogCardioSetRequest,
  SetEntry,
  TrackedExercise,
  UpdateSetRequest,
  WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, type FakeFetch } from '../fake-fetch';
import { activeSession, benchPress, customCurl, session } from '../fixtures';
import { renderApp } from './render-app';

const treadmill: TrackedExercise = {
  ...customCurl,
  id: '9c3a2d5a-4f6e-4a71-8bcd-2e3f4a5b6c7d',
  name: 'Cinta',
  bodyPart: 'cardio',
};

const [strengthSet] = activeSession.sets;
if (strengthSet === undefined) throw new Error('La sesión de las fixtures trae una serie');

const loggedCardio: CardioSetEntry = {
  id: '7b6a5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d',
  kind: 'cardio',
  trackedExerciseId: treadmill.id,
  orderIndex: 1,
  durationSeconds: 600,
  distanceMeters: 1_500,
  rpe: null,
  isWarmup: false,
  completedAt: new Date(Date.parse(strengthSet.completedAt) + 60_000).toISOString(),
};

/**
 * Una sesión abierta que guarda en memoria lo que se registra y se corrige, para que la lista
 * releída enseñe lo que mandó la hoja.
 */
function serveCardioSession(
  fake: FakeFetch,
  exercises: readonly TrackedExercise[],
  initial: WorkoutSessionDetail = activeSession,
): void {
  let current = initial;
  fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
  fake.on('GET', '/exercises', () => jsonResponse(exercises));
  fake.on('POST', `/sessions/${activeSession.id}/sets`, (request) => {
    const body = request.body as LogCardioSetRequest;
    const entry: CardioSetEntry = {
      id: body.id,
      kind: 'cardio',
      trackedExerciseId: body.trackedExerciseId,
      orderIndex: current.sets.length,
      durationSeconds: body.durationSeconds,
      distanceMeters: body.distanceMeters ?? null,
      rpe: body.rpe ?? null,
      isWarmup: body.isWarmup ?? false,
      completedAt: new Date().toISOString(),
    };
    current = { ...current, sets: [...current.sets, entry] };
    return jsonResponse({ set: entry, records: [] }, 201);
  });
  fake.on('PATCH', `/sessions/${activeSession.id}/sets/${loggedCardio.id}`, (request) => {
    const body = request.body as UpdateSetRequest;
    const corrected: CardioSetEntry = {
      ...loggedCardio,
      durationSeconds: body.durationSeconds ?? loggedCardio.durationSeconds,
      distanceMeters:
        body.distanceMeters === undefined ? loggedCardio.distanceMeters : body.distanceMeters,
    };
    current = {
      ...current,
      sets: current.sets.map((set): SetEntry => (set.id === corrected.id ? corrected : set)),
    };
    return jsonResponse({ set: corrected, records: [] });
  });
}

async function openLogSheet(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Registrar serie' }));
}

function submitButton(): HTMLElement {
  return screen.getAllByRole('button', { name: 'Registrar serie' })[1] as HTMLElement;
}

describe('sesión: registrar cardio', () => {
  it('un ejercicio de cardio abre en cardio, sin kilos, y manda duración y distancia', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: `/session?exercise=${treadmill.id}`,
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, treadmill]);
      },
    });

    expect(await screen.findByRole('button', { name: 'Cardio' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByLabelText('Peso')).not.toBeInTheDocument();
    expect(screen.getByText('En minutos, o minutos y segundos: 25:30.')).toBeInTheDocument();
    // Sin duración no hay serie de cardio que mandar.
    expect(submitButton()).toBeDisabled();

    await user.type(screen.getByLabelText('Duración'), '25:30{Enter}');
    await user.type(screen.getByLabelText('Distancia (km)'), '5,2{Enter}');
    await user.click(submitButton());

    expect(await screen.findByRole('button', { name: /25 min 30 s · 5,2 km/ })).toBeInTheDocument();
    const logged = fake.requests.find((request) => request.method === 'POST');
    const body = logged?.body as LogCardioSetRequest;
    expect(body).toMatchObject({
      kind: 'cardio',
      trackedExerciseId: treadmill.id,
      durationSeconds: 1_530,
      distanceMeters: 5_200,
      rpe: null,
      isWarmup: false,
    });
    expect(body).not.toHaveProperty('weight');
  });

  it('propone la duración y la distancia de la última vez', async () => {
    const user = userEvent.setup();
    const withHistory: TrackedExercise = {
      ...treadmill,
      lastCardioSet: {
        durationSeconds: 1_200,
        distanceMeters: 3_000,
        completedAt: '2026-09-10T19:00:00.000Z',
      },
    };
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, withHistory]);
      },
    });

    await openLogSheet(user);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Ejercicio' }), treadmill.id);

    expect(screen.getByLabelText('Duración')).toHaveValue('20');
    expect(screen.getByLabelText('Distancia (km)')).toHaveValue('3');
    expect(screen.getByText(/Lo mismo que la última vez/)).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
  });

  it('en un ejercicio de fuerza se puede cambiar a cardio, sin distancia', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, treadmill]);
      },
    });

    await openLogSheet(user);
    expect(screen.getByRole('button', { name: 'Fuerza' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Calentamiento' }));
    await user.click(screen.getByRole('button', { name: 'Cardio' }));

    // El calentamiento es de la serie, no de sus cifras: sigue marcado al cambiar de tipo.
    expect(screen.getByRole('button', { name: 'Calentamiento' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.type(screen.getByLabelText('Duración'), '10{Enter}');
    await user.click(submitButton());

    expect(
      await screen.findByRole('button', { name: /10 min.*Calentamiento/ }),
    ).toBeInTheDocument();
    const body = fake.requests.find((request) => request.method === 'POST')
      ?.body as LogCardioSetRequest;
    expect(body).toMatchObject({
      kind: 'cardio',
      trackedExerciseId: benchPress.id,
      durationSeconds: 600,
      distanceMeters: null,
      isWarmup: true,
    });
  });

  it('una duración que no se entiende se avisa y no deja registrar', async () => {
    const user = userEvent.setup();
    renderApp({
      path: `/session?exercise=${treadmill.id}`,
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, treadmill]);
      },
    });

    await user.type(await screen.findByLabelText('Duración'), 'media hora{Enter}');

    expect(
      screen.getByText('Escribe los minutos, por ejemplo 30, o minutos y segundos: 25:30'),
    ).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });
});

describe('sesión: corregir cardio', () => {
  const withCardio: WorkoutSessionDetail = {
    ...activeSession,
    sets: [strengthSet, loggedCardio],
  };

  it('la fila de cardio abre la corrección con su duración y su distancia', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, treadmill], withCardio);
      },
    });

    await user.click(await screen.findByRole('button', { name: /10 min · 1,5 km/ }));

    expect(screen.getByRole('heading', { name: /Corregir serie · Cinta/ })).toBeVisible();
    expect(screen.getByLabelText('Duración')).toHaveValue('10');
    expect(screen.getByLabelText('Distancia (km)')).toHaveValue('1,5');
    expect(screen.queryByRole('group', { name: 'Tipo de serie' })).not.toBeInTheDocument();
  });

  it('corrige la duración y quita la distancia con un nulo', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, treadmill], withCardio);
      },
    });

    await user.click(await screen.findByRole('button', { name: /10 min · 1,5 km/ }));
    await user.clear(screen.getByLabelText('Duración'));
    await user.type(screen.getByLabelText('Duración'), '12:30{Enter}');
    await user.clear(screen.getByLabelText('Distancia (km)'));
    await user.type(screen.getByLabelText('Distancia (km)'), '{Enter}');
    await user.click(screen.getByRole('button', { name: 'Sumar un minuto' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('button', { name: /13 min 30 s/ })).toBeInTheDocument();
    const patch = fake.requests.find((request) => request.method === 'PATCH');
    expect(patch?.body).toEqual({
      durationSeconds: 810,
      distanceMeters: null,
      rpe: null,
      isWarmup: false,
    });
  });
});
