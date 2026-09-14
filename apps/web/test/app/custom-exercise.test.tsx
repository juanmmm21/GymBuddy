import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createTrackedExerciseRequestSchema,
  type ExerciseHistory,
  type ExerciseStats,
  type TrackedExercise,
} from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import { errorResponse, jsonResponse, type FakeFetch } from '../fake-fetch';
import { benchPress, bodyParts, customCurl, session } from '../fixtures';
import { renderApp } from './render-app';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Un Worker en memoria para el alta propia: `POST /exercises` guarda la ficha y registra las
 * rutas de su página, porque el id lo pone el cliente y no se conoce hasta que llega.
 */
function serveExerciseCreation(fake: FakeFetch, initial: readonly TrackedExercise[]): void {
  const exercises = [...initial];
  fake.on('GET', '/exercises', () => jsonResponse(exercises));
  fake.on('POST', '/exercises', (request) => {
    const body = createTrackedExerciseRequestSchema.parse(request.body);
    if (body.origin !== 'custom') return errorResponse('validation_failed', 400, 'Solo propios');

    const created: TrackedExercise = {
      ...customCurl,
      id: body.id,
      name: body.name,
      muscle: body.muscle ?? null,
      bodyPart: body.bodyPart ?? null,
    };
    exercises.push(created);

    const stats: ExerciseStats = {
      trackedExerciseId: created.id,
      workingWeight: null,
      records: [],
      points: [],
      stalled: null,
    };
    const history: ExerciseHistory = { trackedExerciseId: created.id, sessions: [] };
    fake.on('GET', `/stats/exercise/${created.id}`, () => jsonResponse(stats));
    fake.on('GET', `/history/exercises/${created.id}`, () => jsonResponse(history));
    return jsonResponse(created, 201);
  });
}

describe('ejercicio propio: desde «Mis ejercicios»', () => {
  it('pide nombre y parte del cuerpo, da de alta con un id del cliente y abre su ficha', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/exercises',
      session,
      setup: (fake) => {
        serveExerciseCreation(fake, [benchPress]);
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Crear ejercicio propio' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Nuevo ejercicio propio' }));
    const submit = sheet.getByRole('button', { name: 'Crear ejercicio' });

    await user.type(sheet.getByRole('textbox', { name: 'Nombre' }), 'Step up en polea');
    // Sin parte del cuerpo no se puede crear, y el músculo espera a que se elija.
    expect(submit).toBeDisabled();
    expect(sheet.getByRole('combobox', { name: 'Músculo' })).toBeDisabled();

    await user.selectOptions(sheet.getByRole('combobox', { name: 'Parte del cuerpo' }), 'legs');
    const muscle = sheet.getByRole('combobox', { name: 'Músculo' });
    expect(
      within(muscle)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Sin concretar',
      'Abductores',
      'Aductores',
      'Gemelos',
      'Glúteos',
      'Isquiotibiales',
      'Cuádriceps',
    ]);
    await user.selectOptions(muscle, 'glutes');
    await user.click(submit);

    expect(await screen.findByRole('heading', { name: 'Step up en polea' })).toBeInTheDocument();

    const creation = fake.requests.find((r) => r.method === 'POST' && r.path === '/exercises');
    expect(creation?.body).toMatchObject({
      origin: 'custom',
      name: 'Step up en polea',
      bodyPart: 'legs',
      muscle: 'glutes',
    });
    expect((creation?.body as { id: string }).id).toMatch(UUID_PATTERN);
  });

  it('cambiar a una parte del cuerpo que no tiene ese músculo lo deja sin concretar', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/exercises',
      session,
      setup: (fake) => {
        serveExerciseCreation(fake, []);
      },
    });

    // Sin ejercicios, el botón también está debajo del aviso vacío.
    await user.click(await screen.findByRole('button', { name: 'Crear ejercicio propio' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Nuevo ejercicio propio' }));

    await user.type(sheet.getByRole('textbox', { name: 'Nombre' }), 'Hip thrust en máquina');
    await user.selectOptions(sheet.getByRole('combobox', { name: 'Parte del cuerpo' }), 'legs');
    await user.selectOptions(sheet.getByRole('combobox', { name: 'Músculo' }), 'glutes');
    await user.selectOptions(sheet.getByRole('combobox', { name: 'Parte del cuerpo' }), 'chest');

    expect(sheet.getByRole('combobox', { name: 'Músculo' })).toHaveValue('');
    await user.click(sheet.getByRole('button', { name: 'Crear ejercicio' }));

    expect(
      await screen.findByRole('heading', { name: 'Hip thrust en máquina' }),
    ).toBeInTheDocument();
    const creation = fake.requests.find((r) => r.method === 'POST' && r.path === '/exercises');
    expect(creation?.body).toMatchObject({ bodyPart: 'chest', muscle: null });
  });

  it('un fallo al crear se ve y deja reintentar con el mismo id', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const { fake } = renderApp({
      path: '/exercises',
      session,
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([benchPress]));
        fake.on('POST', '/exercises', () => {
          attempts += 1;
          return errorResponse('internal_error', 500, 'Se rompió');
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Crear ejercicio propio' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Nuevo ejercicio propio' }));
    await user.type(sheet.getByRole('textbox', { name: 'Nombre' }), 'Remo en máquina');
    await user.selectOptions(sheet.getByRole('combobox', { name: 'Parte del cuerpo' }), 'back');

    await user.click(sheet.getByRole('button', { name: 'Crear ejercicio' }));
    expect(await sheet.findByRole('alert')).toHaveTextContent('Se rompió');
    await user.click(sheet.getByRole('button', { name: 'Crear ejercicio' }));
    await sheet.findByRole('alert');

    expect(attempts).toBe(2);
    const ids = fake.requests
      .filter((r) => r.method === 'POST' && r.path === '/exercises')
      .map((r) => (r.body as { id: string }).id);
    expect(new Set(ids).size).toBe(1);
  });
});

describe('ejercicio propio: desde el buscador del catálogo', () => {
  it('sin resultados ofrece crearlo con lo buscado como nombre', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/catalog',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
        fake.on('GET', '/catalog/search', () => jsonResponse([]));
        serveExerciseCreation(fake, []);
      },
    });

    await screen.findByRole('link', { name: /Pecho/ });
    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar ejercicio' }),
      'hip thrust en máquina',
    );
    await user.click(await screen.findByRole('button', { name: 'Crear «Hip thrust en máquina»' }));

    const sheet = within(await screen.findByRole('dialog', { name: 'Nuevo ejercicio propio' }));
    expect(sheet.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Hip thrust en máquina');

    await user.selectOptions(sheet.getByRole('combobox', { name: 'Parte del cuerpo' }), 'legs');
    await user.click(sheet.getByRole('button', { name: 'Crear ejercicio' }));

    expect(
      await screen.findByRole('heading', { name: 'Hip thrust en máquina' }),
    ).toBeInTheDocument();
    expect(fake.requests.some((r) => r.method === 'POST' && r.path === '/exercises')).toBe(true);
  });

  it('con resultados también deja crearlo, debajo de la lista', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/catalog',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
        fake.on('GET', '/catalog/search', () => jsonResponse([catalogStepUp]));
      },
    });

    await screen.findByRole('link', { name: /Pecho/ });
    await user.type(screen.getByRole('searchbox', { name: 'Buscar ejercicio' }), 'step up');

    expect(await screen.findByRole('link', { name: /Step-up con mancuerna/ })).toBeInTheDocument();
    expect(screen.getByText('¿No es ninguno de estos?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Crear «Step up»' }));

    const sheet = within(await screen.findByRole('dialog', { name: 'Nuevo ejercicio propio' }));
    expect(sheet.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Step up');
  });
});

const catalogStepUp = {
  catalogId: 'glutes/dumbbell-step-up',
  name: 'Step-up con mancuerna',
  muscle: 'glutes',
  bodyPart: 'legs',
  equipment: 'dumbbell',
  gifUrl:
    'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0/glutes/dumbbell-step-up.gif',
} as const;
