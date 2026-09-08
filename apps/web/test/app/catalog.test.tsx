import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { errorResponse, jsonResponse, type FakeFetch, type RecordedRequest } from '../fake-fetch';
import {
  benchPress,
  benchPressHistory,
  benchPressStats,
  bodyParts,
  catalogArcherPushUp,
  catalogBenchPress,
  catalogBenchPressDetail,
  catalogPage,
  catalogSummaries,
  session,
} from '../fixtures';
import { renderApp } from './render-app';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DETAIL_PATH = '/catalog/pectorals/barbell-bench-press';

function queryOf(request: RecordedRequest): URLSearchParams {
  return new URL(request.path, 'http://localhost').searchParams;
}

/** Ruta de la ficha del press de banca, con el idioma que la pantalla debe pedir. */
function serveBenchPressDetail(fake: FakeFetch): void {
  fake.on('GET', '/catalog/exercises/pectorals/barbell-bench-press', () =>
    jsonResponse(catalogBenchPressDetail),
  );
}

/** Lo que pide la ficha del ejercicio seguido a la que se llega tras "seguir". */
function serveTrackedBenchPress(fake: FakeFetch): void {
  fake.on('GET', `/stats/exercise/${benchPress.id}`, () => jsonResponse(benchPressStats));
  fake.on('GET', `/history/exercises/${benchPress.id}`, () => jsonResponse(benchPressHistory));
}

describe('catálogo: navegación por parte del cuerpo', () => {
  it('cada parte del cuerpo enlaza a su página de ejercicios', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/catalog',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
        fake.on('GET', '/catalog/bodyparts/chest', () =>
          jsonResponse(catalogPage([catalogBenchPress, catalogArcherPushUp], 2)),
        );
      },
    });

    await user.click(await screen.findByRole('link', { name: /Pecho/ }));

    expect(await screen.findByRole('heading', { name: 'Pecho' })).toBeInTheDocument();
    expect(screen.getByText('2 ejercicios')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Press de banca con barra/ })).toHaveAttribute(
      'href',
      DETAIL_PATH,
    );
    expect(screen.getByText('Pectorales · Peso corporal')).toBeInTheDocument();

    const pageRequest = fake.requests.find((r) => r.path.startsWith('/catalog/bodyparts/chest'));
    expect(queryOf(pageRequest!).get('lang')).toBe('es');
    expect(queryOf(pageRequest!).get('limit')).toBe('50');
    expect(queryOf(pageRequest!).get('offset')).toBe('0');
  });

  it('"Cargar más" pide la página siguiente y la añade debajo', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/catalog/chest',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts/chest', (request) => {
          const offset = Number(queryOf(request).get('offset'));
          return jsonResponse(catalogPage(catalogSummaries(50, offset), 70, offset));
        });
      },
    });

    expect(await screen.findByText('70 ejercicios')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(50);

    await user.click(screen.getByRole('button', { name: 'Cargar más' }));

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(100);
    });
    expect(screen.getByText('Ejercicio de pecho 100')).toBeInTheDocument();
    expect(screen.getByText('Eso es todo: 100 ejercicios')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();

    const offsets = fake.requests
      .filter((r) => r.path.startsWith('/catalog/bodyparts/chest'))
      .map((r) => queryOf(r).get('offset'));
    expect(offsets).toEqual(['0', '50']);
  });

  it('una parte del cuerpo vacía lo explica en vez de dejar la pantalla en blanco', async () => {
    renderApp({
      path: '/catalog/cardio',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts/cardio', () => jsonResponse(catalogPage([], 0)));
      },
    });

    expect(await screen.findByText('Aquí no hay ejercicios todavía')).toBeInTheDocument();
  });

  it('un segmento que no es una parte del cuerpo avisa y ofrece volver', async () => {
    renderApp({ path: '/catalog/pectorales', session });

    expect(await screen.findByRole('alert')).toHaveTextContent('No existe esa parte del cuerpo');
    // La pestaña y el enlace de vuelta: los dos llevan al catálogo.
    const links = screen.getAllByRole('link', { name: 'Catálogo' });
    expect(links).toHaveLength(2);
    expect(links.every((link) => link.getAttribute('href') === '/catalog')).toBe(true);
  });
});

describe('catálogo: búsqueda', () => {
  it('busca tras una pausa, con el idioma del usuario, y enlaza a las fichas', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/catalog',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
        fake.on('GET', '/catalog/search', () => jsonResponse([catalogBenchPress]));
      },
    });

    await screen.findByRole('link', { name: /Pecho/ });
    await user.type(screen.getByRole('searchbox', { name: 'Buscar ejercicio' }), 'press banca');

    expect(await screen.findByRole('link', { name: /Press de banca con barra/ })).toHaveAttribute(
      'href',
      DETAIL_PATH,
    );
    expect(screen.queryByRole('link', { name: /Pecho/ })).not.toBeInTheDocument();

    const searches = fake.requests.filter((r) => r.path.startsWith('/catalog/search'));
    expect(searches).toHaveLength(1);
    expect(queryOf(searches[0]!).get('q')).toBe('press banca');
    expect(queryOf(searches[0]!).get('lang')).toBe('es');
  });

  it('con una sola letra no busca, y sin resultados lo dice', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/catalog',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
        fake.on('GET', '/catalog/search', () => jsonResponse([]));
      },
    });

    const box = screen.getByRole('searchbox', { name: 'Buscar ejercicio' });
    await user.type(box, 'z');
    // Las partes del cuerpo siguen ahí: una letra no dispara nada.
    expect(await screen.findByRole('link', { name: /Pecho/ })).toBeInTheDocument();
    expect(fake.requests.some((r) => r.path.startsWith('/catalog/search'))).toBe(false);

    await user.type(box, 'zz');
    expect(await screen.findByText('Nada que se llame «zzz»')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Borrar búsqueda' }));
    expect(await screen.findByRole('link', { name: /Pecho/ })).toBeInTheDocument();
    expect(box).toHaveValue('');
  });
});

describe('catálogo: ficha del ejercicio', () => {
  it('pinta el GIF, las etiquetas, los músculos secundarios y las instrucciones', async () => {
    const { fake } = renderApp({
      path: DETAIL_PATH,
      session,
      setup: (fake) => {
        serveBenchPressDetail(fake);
        fake.on('GET', '/exercises', () => jsonResponse([]));
      },
    });

    expect(
      await screen.findByRole('heading', { name: 'Press de banca con barra' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Animación de Press de banca con barra' }),
    ).toHaveAttribute('src', catalogBenchPressDetail.gifUrl);

    const tags = within(screen.getByRole('list', { name: 'Características' }));
    expect(tags.getByText('Pecho')).toBeInTheDocument();
    expect(tags.getByText('Pectorales')).toBeInTheDocument();
    expect(tags.getByText('Barra')).toBeInTheDocument();
    expect(tags.getByText('Fuerza')).toBeInTheDocument();

    expect(screen.getByText('También trabaja: Tríceps, Deltoides')).toBeInTheDocument();
    expect(
      screen.getByText('Activa el pectoral antes de iniciar el movimiento.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ExerciseGymGifsDB' })).toHaveAttribute(
      'href',
      'https://github.com/JahelCuadrado/ExerciseGymGifsDB',
    );
    // La vuelta lleva a la parte del cuerpo del ejercicio, no al catálogo a secas.
    expect(screen.getByRole('link', { name: /Pecho/ })).toHaveAttribute('href', '/catalog/chest');

    const detailRequest = fake.requests.find((r) => r.path.startsWith('/catalog/exercises/'));
    expect(queryOf(detailRequest!).get('lang')).toBe('es');
  });

  it('si el GIF no llega se dice, y la ficha sigue', async () => {
    renderApp({
      path: DETAIL_PATH,
      session,
      setup: (fake) => {
        serveBenchPressDetail(fake);
        fake.on('GET', '/exercises', () => jsonResponse([]));
      },
    });

    fireEvent.error(await screen.findByRole('img', { name: /Animación de/ }));

    expect(await screen.findByText('La animación no se pudo cargar')).toBeInTheDocument();
    expect(screen.getByText('Cómo se hace')).toBeInTheDocument();
  });

  it('"Seguir este ejercicio" da de alta con un id del cliente y abre su ficha', async () => {
    const user = userEvent.setup();
    let tracked = false;
    const { fake } = renderApp({
      path: DETAIL_PATH,
      session,
      setup: (fake) => {
        serveBenchPressDetail(fake);
        serveTrackedBenchPress(fake);
        fake.on('GET', '/exercises', () => jsonResponse(tracked ? [benchPress] : []));
        fake.on('POST', '/exercises', () => {
          tracked = true;
          return jsonResponse(benchPress, 201);
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Seguir este ejercicio' }));

    expect(await screen.findByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mis ejercicios/ })).toHaveAttribute(
      'href',
      '/exercises',
    );

    const creation = fake.requests.find((r) => r.method === 'POST' && r.path === '/exercises');
    expect(creation?.body).toMatchObject({
      origin: 'catalog',
      catalogId: 'pectorals/barbell-bench-press',
    });
    expect((creation?.body as { id: string }).id).toMatch(UUID_PATTERN);
  });

  it('un ejercicio que ya se sigue lo dice y enlaza a su ficha', async () => {
    renderApp({
      path: DETAIL_PATH,
      session,
      setup: (fake) => {
        serveBenchPressDetail(fake);
        fake.on('GET', '/exercises', () => jsonResponse([benchPress]));
      },
    });

    expect(await screen.findByText('Ya lo sigues')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir mi ficha' })).toHaveAttribute(
      'href',
      `/exercises/${benchPress.id}`,
    );
    expect(screen.queryByRole('button', { name: 'Seguir este ejercicio' })).not.toBeInTheDocument();
  });

  it('un 409 porque ya se seguía no es un fallo: se resuelve con la ficha que existe', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: DETAIL_PATH,
      session,
      setup: (fake) => {
        serveBenchPressDetail(fake);
        // El listado sin archivados no lo trae (por eso se pinta el botón), pero el
        // Worker sí lo conoce: es lo que pasa con una ficha archivada o una caché vieja.
        fake.on('GET', '/exercises', (request) =>
          jsonResponse(
            queryOf(request).get('includeArchived') === 'true'
              ? [{ ...benchPress, archivedAt: '2026-09-01T00:00:00.000Z' }]
              : [],
          ),
        );
        fake.on('POST', '/exercises', () =>
          errorResponse('exercise_already_tracked', 409, 'Ya lo sigues'),
        );
        fake.on(`PATCH`, `/exercises/${benchPress.id}`, (request) => {
          expect(request.body).toEqual({ archived: false });
          return jsonResponse(benchPress);
        });
        serveTrackedBenchPress(fake);
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Seguir este ejercicio' }));

    expect(await screen.findByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      fake.requests.some((r) => r.method === 'PATCH' && r.path === `/exercises/${benchPress.id}`),
    ).toBe(true);
  });

  it('cualquier otro fallo al seguir se ve y deja reintentar', async () => {
    const user = userEvent.setup();
    renderApp({
      path: DETAIL_PATH,
      session,
      setup: (fake) => {
        serveBenchPressDetail(fake);
        fake.on('GET', '/exercises', () => jsonResponse([]));
        fake.on('POST', '/exercises', () => errorResponse('internal_error', 500, 'Se rompió'));
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Seguir este ejercicio' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Se rompió');
    expect(screen.getByRole('button', { name: 'Seguir este ejercicio' })).toBeEnabled();
  });

  it('un músculo que no existe avisa en vez de pedir nada', async () => {
    const { fake } = renderApp({ path: '/catalog/pecho/press', session });

    expect(await screen.findByRole('alert')).toHaveTextContent('No existe ese ejercicio');
    expect(fake.requests.some((r) => r.path.startsWith('/catalog/exercises'))).toBe(false);
  });

  it('un ejercicio que el Worker no encuentra muestra su error', async () => {
    renderApp({
      path: '/catalog/pectorals/no-existe',
      session,
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([]));
        fake.on('GET', '/catalog/exercises/pectorals/no-existe', () =>
          errorResponse('not_found', 404, 'No existe el ejercicio "pectorals/no-existe"'),
        );
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('No existe el ejercicio');
  });
});
