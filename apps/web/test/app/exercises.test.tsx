import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TrackedExercise } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import { errorResponse, jsonResponse, type FakeFetch } from '../fake-fetch';
import {
  benchPress,
  benchPressHistory,
  benchPressStats,
  customCurl,
  session,
  squat,
} from '../fixtures';
import { renderApp } from './render-app';

const DETAIL_PATH = `/exercises/${benchPress.id}`;

/** La ficha del press de banca con todo lo que pinta: listado, stats e historial. */
function serveBenchPress(fake: FakeFetch, exercise: TrackedExercise = benchPress): void {
  fake.on('GET', '/exercises', () => jsonResponse([exercise]));
  fake.on('GET', `/stats/exercise/${benchPress.id}`, () => jsonResponse(benchPressStats));
  fake.on('GET', `/history/exercises/${benchPress.id}`, () => jsonResponse(benchPressHistory));
}

describe('mis ejercicios: listado', () => {
  it('agrupa por parte del cuerpo y cada fila enlaza a su ficha', async () => {
    renderApp({
      path: '/exercises',
      session,
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([customCurl, squat, benchPress]));
      },
    });

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(['Pecho', 'Piernas', 'Brazos']);

    expect(screen.getByRole('link', { name: /Press de banca/ })).toHaveAttribute(
      'href',
      DETAIL_PATH,
    );
    expect(screen.getByText('Pectorales')).toBeInTheDocument();
    expect(screen.getByText('Ejercicio propio')).toBeInTheDocument();
    expect(screen.getByText('100 kg × 5')).toBeInTheDocument();
    expect(screen.getByText('Sin series')).toBeInTheDocument();
  });
});

describe('mis ejercicios: ficha', () => {
  it('pinta el peso habitual, las marcas, el estancamiento y las últimas sesiones', async () => {
    const { fake } = renderApp({ path: DETAIL_PATH, session, setup: serveBenchPress });

    expect(await screen.findByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mis ejercicios/ })).toHaveAttribute(
      'href',
      '/exercises',
    );
    expect(screen.getByRole('img', { name: 'Animación de Press de banca' })).toHaveAttribute(
      'src',
      benchPress.gifUrl,
    );

    const tags = within(screen.getByRole('list', { name: 'Características' }));
    expect(tags.getByText('Pecho')).toBeInTheDocument();
    expect(tags.getByText('Pectorales')).toBeInTheDocument();
    expect(tags.getByText('Del catálogo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver en el catálogo' })).toHaveAttribute(
      'href',
      '/catalog/pectorals/barbell-bench-press',
    );

    expect(await screen.findByText('Peso habitual')).toBeInTheDocument();
    expect(screen.getByText('× 8')).toBeInTheDocument();
    expect(screen.getByText(/Mediana de tus últimas 5 sesiones/)).toBeInTheDocument();

    expect(screen.getByText('Peso máximo')).toBeInTheDocument();
    expect(screen.getByText('85 kg')).toBeInTheDocument();
    expect(screen.getByText('1RM estimado')).toBeInTheDocument();
    expect(screen.getByText('104,5 kg')).toBeInTheDocument();

    expect(screen.getByText('Estancado en 82,5 kg')).toBeInTheDocument();
    expect(screen.getByText(/Prueba con 2,5 kg más/)).toBeInTheDocument();

    expect(await screen.findByText('Últimas sesiones')).toBeInTheDocument();
    expect(screen.getByText('60 kg × 10')).toBeInTheDocument();
    expect(screen.getByText('Calentamiento')).toBeInTheDocument();
    expect(screen.getByText('85 kg × 6')).toBeInTheDocument();
    expect(screen.getByText('RPE 8,5')).toBeInTheDocument();
    expect(screen.getByText('82,5 kg × 8')).toBeInTheDocument();

    // La ficha pide también los archivados: la de uno archivado tiene que abrirse.
    const listRequest = fake.requests.find((r) => r.path.startsWith('/exercises'));
    expect(listRequest?.path).toBe('/exercises?includeArchived=true');
  });

  it('sin series todavía lo dice, y no inventa un peso habitual', async () => {
    renderApp({
      path: DETAIL_PATH,
      session,
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([{ ...benchPress, workingWeight: null }]));
        fake.on('GET', `/stats/exercise/${benchPress.id}`, () =>
          jsonResponse({ ...benchPressStats, workingWeight: null, records: [], stalled: null }),
        );
        fake.on('GET', `/history/exercises/${benchPress.id}`, () =>
          jsonResponse({ ...benchPressHistory, sessions: [] }),
        );
      },
    });

    expect(await screen.findByText('Todavía no has registrado ninguna serie')).toBeInTheDocument();
    expect(screen.queryByText('Peso habitual')).not.toBeInTheDocument();
    expect(screen.queryByText('Marcas')).not.toBeInTheDocument();
  });

  it('las notas se editan en la hoja y se guardan con un PATCH', async () => {
    const user = userEvent.setup();
    let current: TrackedExercise = benchPress;
    const { fake } = renderApp({
      path: DETAIL_PATH,
      session,
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([current]));
        fake.on('GET', `/stats/exercise/${benchPress.id}`, () => jsonResponse(benchPressStats));
        fake.on('GET', `/history/exercises/${benchPress.id}`, () =>
          jsonResponse(benchPressHistory),
        );
        fake.on('PATCH', `/exercises/${benchPress.id}`, (request) => {
          const body = request.body as { notes: string | null };
          current = { ...current, notes: body.notes };
          return jsonResponse(current);
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    const notes = screen.getByRole('textbox', { name: 'Notas' });
    expect(notes).toHaveValue('');
    await user.type(notes, '  Codos a 45 grados ');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Codos a 45 grados')).toBeInTheDocument();
    const patch = fake.requests.find((r) => r.method === 'PATCH');
    expect(patch?.body).toEqual({ notes: 'Codos a 45 grados' });
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Notas' })).not.toBeInTheDocument();
    });
  });

  it('renombra un ejercicio propio desde la misma hoja', async () => {
    const user = userEvent.setup();
    let current: TrackedExercise = customCurl;
    const { fake } = renderApp({
      path: `/exercises/${customCurl.id}`,
      session,
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([current]));
        fake.on('GET', `/stats/exercise/${customCurl.id}`, () =>
          jsonResponse({
            trackedExerciseId: customCurl.id,
            workingWeight: null,
            records: [],
            stagnation: null,
          }),
        );
        fake.on('GET', `/history/exercises/${customCurl.id}`, () =>
          jsonResponse({ trackedExerciseId: customCurl.id, sessions: [] }),
        );
        fake.on('PATCH', `/exercises/${customCurl.id}`, (request) => {
          const body = request.body as { name: string; notes: string | null };
          current = { ...current, name: body.name, notes: body.notes };
          return jsonResponse(current);
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    const name = screen.getByRole('textbox', { name: 'Nombre' });
    expect(name).toHaveValue('Curl con la barra rara');
    await user.clear(name);
    await user.type(name, 'Curl con barra Z');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('heading', { name: 'Curl con barra Z' })).toBeInTheDocument();
    expect(fake.requests.find((r) => r.method === 'PATCH')?.body).toEqual({
      name: 'Curl con barra Z',
      notes: null,
    });
  });

  it('un ejercicio del catálogo no ofrece renombrarse: su nombre viene del catálogo', async () => {
    const user = userEvent.setup();
    renderApp({ path: DETAIL_PATH, session, setup: serveBenchPress });

    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    expect(screen.queryByRole('textbox', { name: 'Nombre' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Notas' })).toBeInTheDocument();
  });

  it('no deja guardar un ejercicio propio sin nombre', async () => {
    const user = userEvent.setup();
    renderApp({
      path: `/exercises/${customCurl.id}`,
      session,
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([customCurl]));
        fake.on('GET', `/stats/exercise/${customCurl.id}`, () =>
          jsonResponse({
            trackedExerciseId: customCurl.id,
            workingWeight: null,
            records: [],
            stagnation: null,
          }),
        );
        fake.on('GET', `/history/exercises/${customCurl.id}`, () =>
          jsonResponse({ trackedExerciseId: customCurl.id, sessions: [] }),
        );
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await user.clear(screen.getByRole('textbox', { name: 'Nombre' }));

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('archivar desde la hoja lo avisa en la ficha, y desde el aviso se recupera', async () => {
    const user = userEvent.setup();
    let current: TrackedExercise = benchPress;
    const { fake } = renderApp({
      path: DETAIL_PATH,
      session,
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([current]));
        fake.on('GET', `/stats/exercise/${benchPress.id}`, () => jsonResponse(benchPressStats));
        fake.on('GET', `/history/exercises/${benchPress.id}`, () =>
          jsonResponse(benchPressHistory),
        );
        fake.on('PATCH', `/exercises/${benchPress.id}`, (request) => {
          const body = request.body as { archived: boolean };
          current = { ...current, archivedAt: body.archived ? '2026-09-08T12:00:00.000Z' : null };
          return jsonResponse(current);
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Archivar ejercicio' }));

    expect(await screen.findByText('Ejercicio archivado')).toBeInTheDocument();
    expect(fake.requests.find((r) => r.method === 'PATCH')?.body).toEqual({ archived: true });

    await user.click(screen.getByRole('button', { name: 'Recuperar' }));

    await waitFor(() => {
      expect(screen.queryByText('Ejercicio archivado')).not.toBeInTheDocument();
    });
    const patches = fake.requests.filter((r) => r.method === 'PATCH');
    expect(patches[1]?.body).toEqual({ archived: false });
  });

  it('un fallo al guardar se ve dentro de la hoja y deja reintentar', async () => {
    const user = userEvent.setup();
    renderApp({
      path: DETAIL_PATH,
      session,
      setup: (fake) => {
        serveBenchPress(fake);
        fake.on('PATCH', `/exercises/${benchPress.id}`, () =>
          errorResponse('internal_error', 500, 'Se rompió'),
        );
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Se rompió');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Notas' })).toBeInTheDocument();
  });

  it('un identificador que no es un UUID avisa sin pedir nada', async () => {
    const { fake } = renderApp({ path: '/exercises/no-es-un-id', session });

    expect(await screen.findByText('No existe ese ejercicio')).toBeInTheDocument();
    expect(fake.requests).toHaveLength(0);
  });

  it('un ejercicio que no está entre los seguidos avisa', async () => {
    renderApp({
      path: DETAIL_PATH,
      session,
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([]));
      },
    });

    expect(await screen.findByText('No está entre los ejercicios que sigues.')).toBeInTheDocument();
  });
});
