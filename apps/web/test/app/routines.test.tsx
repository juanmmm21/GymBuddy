import type {
  CreateRoutineRequest,
  Routine,
  RoutineItemInput,
  TrackedExercise,
  UpdateRoutineRequest,
} from '@gymbuddy/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { errorResponse, jsonResponse, type FakeFetch, type RecordedRequest } from '../fake-fetch';
import {
  archivedLegRoutine,
  benchPress,
  customCurl,
  pushRoutine,
  session,
  squat,
} from '../fixtures';
import { renderApp } from './render-app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EDITOR_PATH = `/routines/${pushRoutine.id}`;

const [BENCH_ITEM, SQUAT_ITEM] = pushRoutine.items;
if (BENCH_ITEM === undefined || SQUAT_ITEM === undefined) {
  throw new Error('La rutina de prueba tiene que traer dos líneas');
}

interface ServedRoutines {
  readonly current: () => readonly Routine[];
}

/**
 * Un Worker de rutinas en memoria: el listado devuelve lo que haya, el alta añade y el
 * `PATCH` aplica el cambio como el de verdad (la lista de `items` se renumera entera).
 */
function serveRoutines(
  fake: FakeFetch,
  initial: readonly Routine[],
  exercises: readonly TrackedExercise[] = [benchPress, squat],
): ServedRoutines {
  let routines = [...initial];

  fake.on('GET', '/routines', () => jsonResponse(routines));
  fake.on('GET', '/exercises', () => jsonResponse(exercises));
  fake.on('POST', '/routines', (request) => {
    const body = request.body as CreateRoutineRequest;
    const created: Routine = {
      id: body.id,
      name: body.name,
      description: body.description ?? null,
      createdAt: '2026-09-10T10:00:00.000Z',
      archivedAt: null,
      items: [],
    };
    routines = [...routines, created];
    return jsonResponse(created, 201);
  });

  for (const routine of initial) {
    fake.on('PATCH', `/routines/${routine.id}`, (request) => {
      const body = request.body as UpdateRoutineRequest;
      const index = routines.findIndex((candidate) => candidate.id === routine.id);
      const existing = routines[index];
      if (existing === undefined) return errorResponse('not_found', 404, 'No existe');

      const updated = applyPatch(existing, body);
      routines = routines.map((candidate, position) => (position === index ? updated : candidate));
      return jsonResponse(updated);
    });
  }

  return { current: () => routines };
}

function applyPatch(routine: Routine, body: UpdateRoutineRequest): Routine {
  return {
    ...routine,
    name: body.name ?? routine.name,
    description: body.description === undefined ? routine.description : body.description,
    archivedAt:
      body.archived === undefined
        ? routine.archivedAt
        : body.archived
          ? '2026-09-10T11:00:00.000Z'
          : null,
    items:
      body.items === undefined
        ? routine.items
        : body.items.map((item, orderIndex) => ({ ...item, orderIndex })),
  };
}

function patches(requests: readonly RecordedRequest[]): UpdateRoutineRequest[] {
  return requests
    .filter((request) => request.method === 'PATCH')
    .map((request) => request.body as UpdateRoutineRequest);
}

function itemInputs(items: readonly RoutineItemInput[]): RoutineItemInput[] {
  return items.map(({ id, trackedExerciseId, targetSets, targetRepsMin, targetRepsMax }) => ({
    id,
    trackedExerciseId,
    targetSets,
    targetRepsMin,
    targetRepsMax,
  }));
}

/** Los nombres de las líneas del editor, en el orden en que se ven. */
function shownExerciseNames(): string[] {
  const list = screen.getByRole('list', { name: 'Ejercicios de la rutina' });
  return within(list)
    .getAllByRole('listitem')
    .map((row) => row.querySelector('button span span')?.textContent ?? '');
}

describe('rutinas: listado', () => {
  it('pinta las activas arriba y las archivadas al final, cada una enlazando a su editor', async () => {
    const { fake } = renderApp({
      path: '/routines',
      session,
      setup: (fake) => {
        serveRoutines(fake, [archivedLegRoutine, pushRoutine]);
      },
    });

    const active = await screen.findByRole('list', { name: 'Tus rutinas' });
    expect(within(active).getByRole('link', { name: /Empuje/ })).toHaveAttribute(
      'href',
      EDITOR_PATH,
    );
    expect(within(active).getByText('2 ejercicios · 7 series')).toBeInTheDocument();
    expect(within(active).queryByText('Pierna vieja')).not.toBeInTheDocument();

    const archived = screen.getByRole('region', { name: 'Archivadas' });
    expect(within(archived).getByRole('link', { name: /Pierna vieja/ })).toHaveAttribute(
      'href',
      `/routines/${archivedLegRoutine.id}`,
    );
    expect(within(archived).getByText('Sin ejercicios')).toBeInTheDocument();
    expect(within(archived).getByText('Archivada')).toBeInTheDocument();

    expect(fake.requests.find((request) => request.path.startsWith('/routines'))?.path).toBe(
      '/routines?includeArchived=true',
    );
  });

  it('sin rutinas lo explica y ofrece crear la primera', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/routines',
      session,
      setup: (fake) => {
        serveRoutines(fake, []);
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Crear una rutina' }));

    expect(screen.getByRole('heading', { name: 'Nueva rutina' })).toBeInTheDocument();
  });

  it('se llega desde mis ejercicios', async () => {
    renderApp({
      path: '/exercises',
      session,
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([benchPress]));
      },
    });

    expect(await screen.findByRole('link', { name: 'Rutinas' })).toHaveAttribute(
      'href',
      '/routines',
    );
  });
});

describe('rutinas: alta', () => {
  it('crea la rutina vacía con un identificador del cliente y abre su editor', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/routines',
      session,
      setup: (fake) => {
        serveRoutines(fake, []);
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Nueva' }));
    await user.type(screen.getByRole('textbox', { name: 'Nombre' }), '  Pierna  ');
    await user.type(screen.getByRole('textbox', { name: 'Descripción' }), 'Los martes.');
    await user.click(screen.getByRole('button', { name: 'Crear rutina' }));

    expect(await screen.findByRole('heading', { name: 'Pierna' })).toBeInTheDocument();
    // La cabecera sale del listado de rutinas y el cuerpo espera además a los ejercicios:
    // con la suite cargada, el título llega antes que el aviso y leerlo sin esperar falla.
    expect(await screen.findByText('Esta rutina todavía no tiene ejercicios')).toBeInTheDocument();
    expect(screen.getByText('Los martes.')).toBeInTheDocument();

    const body = fake.requests.find((request) => request.method === 'POST')
      ?.body as CreateRoutineRequest;
    expect(body).toEqual({
      id: expect.stringMatching(UUID) as unknown,
      name: 'Pierna',
      description: 'Los martes.',
      items: [],
    });
  });

  it('no deja crear una rutina sin nombre', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/routines',
      session,
      setup: (fake) => {
        serveRoutines(fake, []);
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Nueva' }));
    await user.type(screen.getByRole('textbox', { name: 'Nombre' }), '   ');

    expect(screen.getByRole('button', { name: 'Crear rutina' })).toBeDisabled();
  });
});

describe('rutinas: editor', () => {
  it('pinta las líneas en orden, con su objetivo y el aviso del ejercicio archivado', async () => {
    const archivedSquat = { ...squat, archivedAt: '2026-09-08T12:00:00.000Z' };
    renderApp({
      path: EDITOR_PATH,
      session,
      setup: (fake) => {
        serveRoutines(fake, [pushRoutine], [benchPress, archivedSquat]);
      },
    });

    expect(await screen.findByRole('heading', { name: 'Empuje' })).toBeInTheDocument();
    expect(screen.getByText('2 ejercicios · 7 series')).toBeInTheDocument();
    expect(screen.getByText('Lunes y jueves.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Rutinas/ })).toHaveAttribute('href', '/routines');

    expect(shownExerciseNames()).toEqual(['Press de banca', 'Sentadilla con barra']);
    expect(
      screen.getByRole('button', { name: 'Editar Press de banca, 4 series × 6–8 reps' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Editar Sentadilla con barra, 3 series × 5 reps' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Archivado')).toBeInTheDocument();

    // La primera no sube y la última no baja.
    expect(screen.getByRole('button', { name: 'Subir Press de banca' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bajar Sentadilla con barra' })).toBeDisabled();
  });

  it('añade una línea al final con su propio identificador y sin tocar las demás', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: EDITOR_PATH,
      session,
      setup: (fake) => {
        serveRoutines(fake, [pushRoutine], [benchPress, squat, customCurl]);
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Añadir ejercicio' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Ejercicio' }), customCurl.id);
    await user.click(screen.getByRole('button', { name: 'Sumar una a series' }));
    await user.click(screen.getByRole('button', { name: 'Añadir a la rutina' }));

    await waitFor(() => {
      expect(shownExerciseNames()).toEqual([
        'Press de banca',
        'Sentadilla con barra',
        'Curl con la barra rara',
      ]);
    });
    expect(screen.queryByRole('heading', { name: 'Añadir ejercicio' })).not.toBeInTheDocument();

    const [patch] = patches(fake.requests);
    expect(patch?.items?.slice(0, 2)).toEqual(itemInputs(pushRoutine.items));
    expect(patch?.items?.[2]).toEqual({
      id: expect.stringMatching(UUID) as unknown,
      trackedExerciseId: customCurl.id,
      targetSets: 4,
      targetRepsMin: 8,
      targetRepsMax: 12,
    });
    expect(patch).not.toHaveProperty('name');
  });

  it('el selector de añadir no ofrece ejercicios archivados', async () => {
    const user = userEvent.setup();
    const archivedCurl = { ...customCurl, archivedAt: '2026-09-08T12:00:00.000Z' };
    renderApp({
      path: EDITOR_PATH,
      session,
      setup: (fake) => {
        serveRoutines(fake, [pushRoutine], [benchPress, squat, archivedCurl]);
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Añadir ejercicio' }));

    const select = screen.getByRole('combobox', { name: 'Ejercicio' });
    expect(within(select).queryByRole('option', { name: /Curl/ })).not.toBeInTheDocument();
    expect(select).toHaveValue(benchPress.id);
  });

  it('corregir una línea conserva su identificador y su puesto', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: EDITOR_PATH,
      session,
      setup: (fake) => {
        serveRoutines(fake, [pushRoutine]);
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Editar Sentadilla con barra, 3 series × 5 reps' }),
    );
    expect(screen.getByRole('combobox', { name: 'Ejercicio' })).toHaveValue(squat.id);
    await user.click(screen.getByRole('button', { name: 'Sumar una a repeticiones máximas' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByRole('button', {
        name: 'Editar Sentadilla con barra, 3 series × 5–6 reps',
      }),
    ).toBeInTheDocument();
    expect(patches(fake.requests)[0]?.items).toEqual([
      itemInputs([BENCH_ITEM])[0],
      { ...itemInputs([SQUAT_ITEM])[0], targetRepsMax: 6 },
    ]);
  });

  it('quita una línea desde su hoja', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: EDITOR_PATH,
      session,
      setup: (fake) => {
        serveRoutines(fake, [pushRoutine]);
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Editar Press de banca, 4 series × 6–8 reps' }),
    );
    await user.click(screen.getByRole('button', { name: 'Quitar de la rutina' }));

    await waitFor(() => {
      expect(shownExerciseNames()).toEqual(['Sentadilla con barra']);
    });
    expect(patches(fake.requests)[0]?.items).toEqual(itemInputs([SQUAT_ITEM]));
  });

  it('no deja guardar un rango de repeticiones al revés, y lo explica', async () => {
    const user = userEvent.setup();
    renderApp({
      path: EDITOR_PATH,
      session,
      setup: (fake) => {
        serveRoutines(fake, [pushRoutine]);
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Editar Sentadilla con barra, 3 series × 5 reps' }),
    );
    await user.click(screen.getByRole('button', { name: 'Restar una a repeticiones máximas' }));

    expect(screen.getByText('Tiene que ser igual o mayor que el mínimo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('las flechas reordenan y mandan la lista entera en su nuevo orden', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: EDITOR_PATH,
      session,
      setup: (fake) => {
        serveRoutines(fake, [pushRoutine]);
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Subir Sentadilla con barra' }));

    await waitFor(() => {
      expect(shownExerciseNames()).toEqual(['Sentadilla con barra', 'Press de banca']);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bajar Press de banca' })).toBeDisabled();
    });
    expect(patches(fake.requests)).toEqual([{ items: itemInputs([SQUAT_ITEM, BENCH_ITEM]) }]);
  });

  it('si el reordenado falla, lo dice y la lista vuelve a lo guardado', async () => {
    const user = userEvent.setup();
    renderApp({
      path: EDITOR_PATH,
      session,
      setup: (fake) => {
        serveRoutines(fake, [pushRoutine]);
        fake.on('PATCH', `/routines/${pushRoutine.id}`, () =>
          errorResponse('internal_error', 500, 'Se rompió'),
        );
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Bajar Press de banca' }));

    expect(await screen.findByText('No se pudo cambiar el orden')).toBeInTheDocument();
    expect(shownExerciseNames()).toEqual(['Press de banca', 'Sentadilla con barra']);
  });

  it('con el tope de ejercicios no deja añadir más', async () => {
    const items = Array.from({ length: 30 }, (_, index) => ({
      ...BENCH_ITEM,
      id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      orderIndex: index,
    }));
    renderApp({
      path: EDITOR_PATH,
      session,
      setup: (fake) => {
        serveRoutines(fake, [{ ...pushRoutine, items }]);
      },
    });

    expect(await screen.findByRole('button', { name: 'Añadir ejercicio' })).toBeDisabled();
    expect(screen.getByText('Una rutina admite hasta 30 ejercicios.')).toBeInTheDocument();
  });

  it('renombra y archiva desde la hoja, y la archivada se recupera desde el aviso', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: EDITOR_PATH,
      session,
      setup: (fake) => {
        serveRoutines(fake, [pushRoutine]);
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const name = screen.getByRole('textbox', { name: 'Nombre' });
    await user.clear(name);
    await user.type(name, 'Empuje pesado');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('heading', { name: 'Empuje pesado' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Archivar rutina' }));

    expect(await screen.findByText('Rutina archivada')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Recuperar' }));

    await waitFor(() => {
      expect(screen.queryByText('Rutina archivada')).not.toBeInTheDocument();
    });
    expect(patches(fake.requests)).toEqual([
      { name: 'Empuje pesado', description: 'Lunes y jueves.' },
      { archived: true },
      { archived: false },
    ]);
  });

  it('un identificador que no es un UUID avisa sin preguntar al Worker', async () => {
    const { fake } = renderApp({ path: '/routines/no-es-un-uuid', session });

    expect(await screen.findByText('No existe esa rutina')).toBeInTheDocument();
    expect(fake.requests.some((request) => request.path.startsWith('/routines'))).toBe(false);
  });

  it('una rutina que no está en el listado avisa', async () => {
    renderApp({
      path: EDITOR_PATH,
      session,
      setup: (fake) => {
        serveRoutines(fake, [archivedLegRoutine]);
      },
    });

    expect(await screen.findByText('No está entre tus rutinas.')).toBeInTheDocument();
  });
});
