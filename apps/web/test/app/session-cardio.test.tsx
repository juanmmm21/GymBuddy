import type {
  CardioSetEntry,
  LogCardioSetRequest,
  SetEntry,
  StartCardioRequest,
  TrackedExercise,
  UpdateSetRequest,
  WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { screen, within } from '@testing-library/react';
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
    current = { ...current, sets: [...current.sets, entry], cardioStartedAt: null };
    return jsonResponse({ set: entry, records: [] }, 201);
  });
  fake.on('PUT', `/sessions/${activeSession.id}/cardio`, (request) => {
    const body = request.body as StartCardioRequest;
    current = { ...current, cardioStartedAt: body.startedAt ?? null };
    return jsonResponse(current);
  });
  fake.on('DELETE', `/sessions/${activeSession.id}/cardio`, () => {
    current = { ...current, cardioStartedAt: null };
    return new Response(null, { status: 204 });
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

    expect(await screen.findByLabelText('Duración')).toBeInTheDocument();
    expect(screen.queryByLabelText('Peso')).not.toBeInTheDocument();
    // El tipo sale del ejercicio: no hay nada que elegir.
    expect(screen.queryByRole('group', { name: 'Tipo de serie' })).not.toBeInTheDocument();
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

  it('el tipo sigue al ejercicio elegido: fuerza pide kilos y cardio, duración', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, treadmill]);
      },
    });

    await openLogSheet(user);
    expect(screen.getByLabelText('Peso')).toBeInTheDocument();
    expect(screen.queryByLabelText('Duración')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Tipo de serie' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Ejercicio' }), treadmill.id);
    expect(screen.queryByLabelText('Peso')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Duración'), '10{Enter}');
    await user.click(submitButton());

    expect(await screen.findByRole('button', { name: /10 min/ })).toBeInTheDocument();
    const body = fake.requests.find((request) => request.method === 'POST')
      ?.body as LogCardioSetRequest;
    expect(body).toMatchObject({
      kind: 'cardio',
      trackedExerciseId: treadmill.id,
      durationSeconds: 600,
      distanceMeters: null,
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

describe('sesión: cardio final al terminar', () => {
  async function openEndSheet(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
    await user.click(await screen.findByRole('button', { name: 'Terminar sesión' }));
    return screen.findByRole('dialog', { name: 'Terminar sesión' });
  }

  it('ofrece apuntar cardio, abre la hoja en cardio y vuelve a terminar sin volver a ofrecerlo', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, treadmill]);
      },
    });

    const summary = await openEndSheet(user);
    expect(within(summary).getByText('¿Rematas con cardio?')).toBeInTheDocument();
    await user.click(within(summary).getByRole('button', { name: 'Apuntar cardio' }));

    const log = await screen.findByRole('dialog', { name: 'Registrar serie' });
    expect(within(log).getByRole('combobox', { name: 'Ejercicio' })).toHaveValue(treadmill.id);
    await user.type(within(log).getByLabelText('Duración'), '20{Enter}');
    await user.click(within(log).getByRole('button', { name: 'Registrar serie' }));

    const again = await screen.findByRole('dialog', { name: 'Terminar sesión' });
    expect(within(again).queryByText('¿Rematas con cardio?')).not.toBeInTheDocument();
    expect(within(again).getByText('Series').parentElement).toHaveTextContent('2');
    const body = fake.requests.find((request) => request.method === 'POST')
      ?.body as LogCardioSetRequest;
    expect(body).toMatchObject({
      kind: 'cardio',
      trackedExerciseId: treadmill.id,
      durationSeconds: 1_200,
    });
  });

  it('precarga la duración de la última vez del cardio propuesto', async () => {
    const user = userEvent.setup();
    const withHistory: TrackedExercise = {
      ...treadmill,
      lastCardioSet: {
        durationSeconds: 900,
        distanceMeters: null,
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

    const summary = await openEndSheet(user);
    await user.click(within(summary).getByRole('button', { name: 'Apuntar cardio' }));

    const log = await screen.findByRole('dialog', { name: 'Registrar serie' });
    expect(within(log).queryByLabelText('Peso')).not.toBeInTheDocument();
    expect(within(log).getByLabelText('Duración')).toHaveValue('15');
  });

  it('cerrar la hoja de cardio sin apuntarlo deja la sesión abierta, sin volver a terminar', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, treadmill]);
      },
    });

    const summary = await openEndSheet(user);
    await user.click(within(summary).getByRole('button', { name: 'Apuntar cardio' }));
    const log = await screen.findByRole('dialog', { name: 'Registrar serie' });
    await user.click(within(log).getByRole('button', { name: 'Cerrar' }));

    expect(screen.queryByRole('dialog', { name: 'Terminar sesión' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar serie' })).toBeInTheDocument();
  });

  it('sin ningún ejercicio de cardio manda al cardio del catálogo', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress]);
      },
    });

    const summary = await openEndSheet(user);
    expect(within(summary).getByText(/No sigues ningún ejercicio de cardio/)).toBeInTheDocument();
    expect(
      within(summary).getByRole('link', { name: 'Ver cardio en el catálogo' }),
    ).toHaveAttribute('href', '/catalog/cardio');
  });

  it('una sesión que ya termina en cardio no lo ofrece', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, treadmill], {
          ...activeSession,
          sets: [strengthSet, loggedCardio],
        });
      },
    });

    const summary = await openEndSheet(user);
    expect(within(summary).queryByText('¿Rematas con cardio?')).not.toBeInTheDocument();
  });
});

describe('sesión: cardio en marcha', () => {
  const minutesAgo = (minutes: number): string =>
    new Date(Date.now() - minutes * 60_000).toISOString();

  it('«Empezar cardio» lo pone en marcha con la hora de la pulsación y ocupa el sitio del descanso', async () => {
    const user = userEvent.setup();
    const before = Date.now();
    const { fake } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, treadmill]);
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Empezar cardio' }));

    const card = await screen.findByRole('region', { name: 'Cardio en marcha' });
    expect(within(card).getByText(/La sesión no se cierra mientras dure/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Empezar cardio' })).not.toBeInTheDocument();
    const put = fake.requests.find((request) => request.method === 'PUT');
    const startedAt = (put?.body as StartCardioRequest).startedAt ?? '';
    expect(Date.parse(startedAt)).toBeGreaterThanOrEqual(before);
  });

  it('sin ningún ejercicio de cardio no se ofrece empezarlo', async () => {
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress]);
      },
    });

    expect(await screen.findByRole('button', { name: 'Registrar serie' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Empezar cardio' })).not.toBeInTheDocument();
  });

  it('«Apuntar cardio» abre la hoja con la cinta y el tiempo que lleva, y al registrarlo se apaga', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, treadmill], {
          ...activeSession,
          cardioStartedAt: minutesAgo(25),
        });
      },
    });

    const card = await screen.findByRole('region', { name: 'Cardio en marcha' });
    await user.click(within(card).getByRole('button', { name: 'Apuntar cardio' }));

    const log = await screen.findByRole('dialog', { name: 'Registrar serie' });
    expect(within(log).getByRole('combobox', { name: 'Ejercicio' })).toHaveValue(treadmill.id);
    expect(within(log).getByLabelText('Duración')).toHaveValue('25');
    expect(within(log).getByText(/desde que empezaste el cardio/)).toBeInTheDocument();
    await user.click(within(log).getByRole('button', { name: 'Registrar serie' }));

    expect(await screen.findByRole('button', { name: 'Empezar cardio' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cardio en marcha' })).not.toBeInTheDocument();
    const body = fake.requests.find((request) => request.method === 'POST')
      ?.body as LogCardioSetRequest;
    expect(body).toMatchObject({ kind: 'cardio', durationSeconds: 1_500 });
  });

  it('«Quitar cardio» lo apaga sin apuntar nada', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, treadmill], {
          ...activeSession,
          cardioStartedAt: minutesAgo(5),
        });
      },
    });

    const card = await screen.findByRole('region', { name: 'Cardio en marcha' });
    await user.click(within(card).getByRole('button', { name: 'Quitar cardio' }));

    expect(await screen.findByRole('button', { name: 'Empezar cardio' })).toBeInTheDocument();
    expect(fake.requests.some((request) => request.method === 'DELETE')).toBe(true);
    expect(fake.requests.some((request) => request.method === 'POST')).toBe(false);
  });

  it('pasada la hora sin series, un cardio en marcha mantiene la sesión en pantalla', async () => {
    const [set] = activeSession.sets;
    if (set === undefined) throw new Error('La sesión de las fixtures trae una serie');
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, treadmill], {
          ...activeSession,
          startedAt: minutesAgo(150),
          sets: [{ ...set, completedAt: minutesAgo(120) }],
          cardioStartedAt: minutesAgo(90),
        });
      },
    });

    expect(await screen.findByRole('region', { name: 'Cardio en marcha' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Empezar a entrenar' })).not.toBeInTheDocument();
  });

  it('desde «Terminar sesión» se puede empezar ahora, y con uno en marcha se ofrece apuntarlo', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveCardioSession(fake, [benchPress, treadmill]);
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Terminar sesión' }));
    const summary = await screen.findByRole('dialog', { name: 'Terminar sesión' });
    await user.click(within(summary).getByRole('button', { name: 'Empezar cardio ahora' }));

    expect(await screen.findByRole('region', { name: 'Cardio en marcha' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Terminar sesión' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Terminar sesión' }));
    const again = await screen.findByRole('dialog', { name: 'Terminar sesión' });
    expect(within(again).getByText('Tu cardio sigue en marcha')).toBeInTheDocument();
    expect(
      within(again).queryByRole('button', { name: 'Empezar cardio ahora' }),
    ).not.toBeInTheDocument();
  });
});
