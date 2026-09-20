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

  it('acredita el catálogo externo al pie de la entrada', async () => {
    // El repositorio de origen no tiene licencia y sus GIFs son de terceros: el crédito visible
    // es parte del trato (ADR 0001), así que un test lo sujeta.
    renderApp({
      path: '/catalog',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
      },
    });

    const credit = await screen.findByRole('link', { name: /catálogo de ejercicios en GitHub/ });
    expect(credit).toHaveAttribute('href', 'https://github.com/JahelCuadrado/ExerciseGymGifsDB');
    expect(credit).toHaveTextContent('JahelCuadrado/ExerciseGymGifsDB');
    expect(screen.getByText(/servidos por jsDelivr/)).toBeInTheDocument();
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

    const result = await screen.findByRole('link', { name: /Press de banca con barra/ });
    expect(result).toHaveAttribute('href', DETAIL_PATH);
    // La miniatura baja solo al verse y con la dirección que la deja fuera de la caché offline.
    const thumb = result.querySelector('img');
    expect(thumb).toHaveAttribute('src', `${catalogBenchPress.gifUrl}?preview`);
    expect(thumb).toHaveAttribute('loading', 'lazy');
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

describe('catálogo: filtros', () => {
  it('en una parte del cuerpo filtra por equipamiento y por sus músculos', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/catalog/chest',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts/chest', (request) =>
          queryOf(request).get('equipment') === 'barbell'
            ? jsonResponse(catalogPage([catalogBenchPress], 1))
            : jsonResponse(catalogPage([catalogBenchPress, catalogArcherPushUp], 2)),
        );
      },
    });

    expect(await screen.findByText('2 ejercicios')).toBeInTheDocument();
    const filters = screen.getByRole('region', { name: 'Filtros del catálogo' });
    const muscle = within(filters).getByRole('combobox', { name: 'Músculo' });
    // Pecho solo tiene pectorales y serrato: nada de «Cuádriceps» aquí.
    expect(
      within(muscle)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Todos', 'Pectorales', 'Serrato anterior']);
    expect(within(filters).queryByRole('button', { name: 'Quitar filtros' })).toBeNull();

    await user.selectOptions(
      within(filters).getByRole('combobox', { name: 'Equipamiento' }),
      'Barra',
    );

    expect(await screen.findByText('1 ejercicio')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Flexión del arquero/ })).not.toBeInTheDocument();
    const last = fake.requests.filter((r) => r.path.startsWith('/catalog/bodyparts/chest')).at(-1);
    expect(queryOf(last!).get('equipment')).toBe('barbell');
    expect(queryOf(last!).has('muscle')).toBe(false);
    expect(queryOf(last!).get('offset')).toBe('0');

    await user.click(within(filters).getByRole('button', { name: 'Quitar filtros' }));
    expect(await screen.findByText('2 ejercicios')).toBeInTheDocument();
  });

  it('lee los filtros de la URL y, si no queda nada, deja quitarlos', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/catalog/back?equipment=cable&muscle=lats',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts/back', (request) =>
          queryOf(request).has('equipment')
            ? jsonResponse(catalogPage([], 0))
            : jsonResponse(catalogPage(catalogSummaries(3), 3)),
        );
      },
    });

    expect(await screen.findByText('Nada con «Polea · Dorsales»')).toBeInTheDocument();
    const first = fake.requests.find((r) => r.path.startsWith('/catalog/bodyparts/back'));
    expect(queryOf(first!).get('equipment')).toBe('cable');
    expect(queryOf(first!).get('muscle')).toBe('lats');
    expect(screen.getByRole('combobox', { name: 'Músculo' })).toHaveValue('lats');

    // Uno en la barra y otro en el aviso: los dos hacen lo mismo.
    const clearButtons = screen.getAllByRole('button', { name: 'Quitar filtros' });
    expect(clearButtons).toHaveLength(2);
    await user.click(clearButtons[1]!);

    expect(await screen.findByText('3 ejercicios')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Equipamiento' })).toHaveValue('');
  });

  it('un músculo de otra parte en la URL se ignora y hombros no ofrece músculo', async () => {
    const { fake } = renderApp({
      path: '/catalog/shoulders?muscle=quads',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts/shoulders', () =>
          jsonResponse(catalogPage(catalogSummaries(1), 1)),
        );
      },
    });

    expect(await screen.findByText('1 ejercicio')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Músculo' })).not.toBeInTheDocument();
    const request = fake.requests.find((r) => r.path.startsWith('/catalog/bodyparts/shoulders'));
    expect(queryOf(request!).has('muscle')).toBe(false);
  });

  it('la búsqueda se filtra, conserva los filtros al teclear y avisa si los filtros lo dejan fuera', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/catalog',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
        fake.on('GET', '/catalog/search', (request) =>
          queryOf(request).get('muscle') === 'lats' && queryOf(request).get('q') === 'remo polea'
            ? jsonResponse([])
            : jsonResponse([catalogBenchPress]),
        );
      },
    });

    await screen.findByRole('link', { name: /Pecho/ });
    // Sin buscar no hay filtros: la lista de partes del cuerpo no se filtra.
    expect(screen.queryByRole('region', { name: 'Filtros del catálogo' })).toBeNull();

    const box = screen.getByRole('searchbox', { name: 'Buscar ejercicio' });
    await user.type(box, 'remo');
    await screen.findByRole('link', { name: /Press de banca con barra/ });

    const muscle = screen.getByRole('combobox', { name: 'Músculo' });
    // En la búsqueda salen los diecinueve, agrupados por parte del cuerpo.
    expect(within(muscle).getAllByRole('option')).toHaveLength(20);
    await user.selectOptions(muscle, 'Dorsales');
    await waitFor(() => {
      const last = fake.requests.filter((r) => r.path.startsWith('/catalog/search')).at(-1);
      expect(queryOf(last!).get('muscle')).toBe('lats');
    });

    await user.type(box, ' polea');
    expect(
      await screen.findByText('Nada que se llame «remo polea» con «Dorsales»'),
    ).toBeInTheDocument();
    const last = fake.requests.filter((r) => r.path.startsWith('/catalog/search')).at(-1);
    expect(queryOf(last!).get('q')).toBe('remo polea');
    expect(queryOf(last!).get('muscle')).toBe('lats');
    expect(screen.getByRole('button', { name: 'Crear «Remo polea»' })).toBeInTheDocument();

    const buttons = screen.getAllByRole('button', { name: 'Quitar filtros' });
    await user.click(buttons.at(-1)!);
    expect(
      await screen.findByRole('link', { name: /Press de banca con barra/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Músculo' })).toHaveValue('');
  });

  it('la búsqueda se filtra por una parte del cuerpo entera y el músculo se ciñe a ella', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/catalog',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
        fake.on('GET', '/catalog/search', (request) =>
          queryOf(request).get('bodyPart') === 'chest'
            ? jsonResponse([catalogBenchPress])
            : jsonResponse([]),
        );
      },
    });
    const lastSearch = (): URLSearchParams =>
      queryOf(fake.requests.filter((r) => r.path.startsWith('/catalog/search')).at(-1)!);

    await screen.findByRole('link', { name: /Pecho/ });
    await user.type(screen.getByRole('searchbox', { name: 'Buscar ejercicio' }), 'press');
    const part = await screen.findByRole('combobox', { name: 'Parte del cuerpo' });
    expect(lastSearch().has('bodyPart')).toBe(false);

    await user.selectOptions(part, 'Pecho');
    expect(
      await screen.findByRole('link', { name: /Press de banca con barra/ }),
    ).toBeInTheDocument();
    expect(lastSearch().get('bodyPart')).toBe('chest');
    // Con una parte elegida, el músculo ofrece solo los suyos, como en la página de esa parte.
    const muscle = screen.getByRole('combobox', { name: 'Músculo' });
    expect(
      within(muscle)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Todos', 'Pectorales', 'Serrato anterior']);
    await user.selectOptions(muscle, 'Pectorales');
    await waitFor(() => {
      expect(lastSearch().get('muscle')).toBe('pectorals');
    });

    // Cambiar a otra parte suelta el músculo: nunca sale una petición que se contradiga.
    await user.selectOptions(part, 'Espalda');
    expect(await screen.findByText('Nada que se llame «press» con «Espalda»')).toBeInTheDocument();
    expect(lastSearch().get('bodyPart')).toBe('back');
    expect(lastSearch().has('muscle')).toBe(false);
    expect(screen.getByRole('combobox', { name: 'Músculo' })).toHaveValue('');

    // Hombros tiene un solo músculo: el desplegable desaparece.
    await user.selectOptions(part, 'Hombros');
    await waitFor(() => {
      expect(lastSearch().get('bodyPart')).toBe('shoulders');
    });
    expect(screen.queryByRole('combobox', { name: 'Músculo' })).not.toBeInTheDocument();
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
    const gif = screen.getByRole('img', { name: 'Animación de Press de banca con barra' });
    expect(gif).toHaveAttribute('src', catalogBenchPressDetail.gifUrl);
    // En modo CORS, para que el service worker guarde un 200 y no una respuesta opaca.
    expect(gif).toHaveAttribute('crossorigin', 'anonymous');

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

describe('catálogo: volver desde la ficha', () => {
  it('atrás desde un ejercicio buscado vuelve a la búsqueda con su texto y sus filtros', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/catalog',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
        fake.on('GET', '/catalog/search', () => jsonResponse([catalogBenchPress]));
        serveBenchPressDetail(fake);
        fake.on('GET', '/exercises', () => jsonResponse([]));
      },
    });
    const searches = (): RecordedRequest[] =>
      fake.requests.filter((r) => r.path.startsWith('/catalog/search'));

    await screen.findByRole('link', { name: /Pecho/ });
    await user.type(screen.getByRole('searchbox', { name: 'Buscar ejercicio' }), 'press banca');
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Parte del cuerpo' }),
      'Pecho',
    );
    await waitFor(() => {
      expect(queryOf(searches().at(-1)!).get('bodyPart')).toBe('chest');
    });

    await user.click(screen.getByRole('link', { name: /Press de banca con barra/ }));
    expect(
      await screen.findByRole('heading', { name: 'Press de banca con barra' }),
    ).toBeInTheDocument();
    // La vuelta lleva a la búsqueda, no a la parte del cuerpo del ejercicio.
    expect(screen.queryByRole('link', { name: /Pecho/ })).not.toBeInTheDocument();
    const back = screen.getByRole('link', { name: /Búsqueda/ });
    const backUrl = new URL(back.getAttribute('href')!, 'http://localhost');
    expect(backUrl.pathname).toBe('/catalog');
    expect(backUrl.searchParams.get('q')).toBe('press banca');
    expect(backUrl.searchParams.get('bodyPart')).toBe('chest');

    await user.click(back);
    expect(
      await screen.findByRole('link', { name: /Press de banca con barra/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Buscar ejercicio' })).toHaveValue('press banca');
    expect(screen.getByRole('combobox', { name: 'Parte del cuerpo' })).toHaveValue('chest');
    expect(queryOf(searches().at(-1)!).get('q')).toBe('press banca');
    expect(queryOf(searches().at(-1)!).get('bodyPart')).toBe('chest');
  });

  it('una búsqueda en la URL se abre hecha y suelta el músculo que contradice la parte', async () => {
    const { fake } = renderApp({
      path: '/catalog?q=press&bodyPart=chest&muscle=lats',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/search', () => jsonResponse([catalogBenchPress]));
      },
    });

    expect(
      await screen.findByRole('link', { name: /Press de banca con barra/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Buscar ejercicio' })).toHaveValue('press');
    expect(screen.getByRole('combobox', { name: 'Parte del cuerpo' })).toHaveValue('chest');
    expect(screen.getByRole('combobox', { name: 'Músculo' })).toHaveValue('');
    const request = fake.requests.find((r) => r.path.startsWith('/catalog/search'));
    expect(queryOf(request!).get('bodyPart')).toBe('chest');
    expect(queryOf(request!).has('muscle')).toBe(false);
  });

  it('la pestaña «Catálogo» vacía la búsqueda', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/catalog?q=press',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
        fake.on('GET', '/catalog/search', () => jsonResponse([catalogBenchPress]));
      },
    });

    await screen.findByRole('link', { name: /Press de banca con barra/ });
    const bar = screen.getByRole('navigation', { name: 'Secciones' });
    await user.click(within(bar).getByRole('link', { name: /Catálogo/ }));

    expect(await screen.findByRole('link', { name: /Pecho/ })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Buscar ejercicio' })).toHaveValue('');
  });

  it('atrás desde la página de una parte vuelve con sus filtros puestos', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/catalog/chest?equipment=barbell',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts/chest', () =>
          jsonResponse(catalogPage([catalogBenchPress], 1)),
        );
        serveBenchPressDetail(fake);
        fake.on('GET', '/exercises', () => jsonResponse([]));
      },
    });

    await user.click(await screen.findByRole('link', { name: /Press de banca con barra/ }));
    await screen.findByRole('heading', { name: 'Press de banca con barra' });
    const back = screen.getByRole('link', { name: /Pecho/ });
    expect(back).toHaveAttribute('href', '/catalog/chest?equipment=barbell');

    await user.click(back);
    expect(await screen.findByText('1 ejercicio')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Equipamiento' })).toHaveValue('barbell');
  });
});
