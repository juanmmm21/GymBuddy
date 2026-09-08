import { describe, expect, it } from 'vitest';
import {
  CatalogSourceError,
  fetchMuscleFile,
  muscleFileUrl,
  muscleIndexUrl,
} from '../src/catalog/client';
import { CATALOG_VERSION } from '../src/catalog/source';
import { createCatalogFetch, muscleFile } from './catalog-fixtures';

/** Ni un solo test sale a internet: todos pasan por un `fetch` inyectado. */
const noWait = (): Promise<void> => Promise.resolve();

describe('urls del catálogo', () => {
  it('van ancladas al tag y nunca a main', () => {
    expect(muscleFileUrl('pectorals', 'es')).toBe(
      `https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@${CATALOG_VERSION}/api/es/muscles/pectorals.json`,
    );
    expect(muscleIndexUrl('en')).not.toContain('@main');
  });
});

describe('fetchMuscleFile', () => {
  it('devuelve el fichero del músculo cuando el origen responde', async () => {
    const cdn = createCatalogFetch();

    const file = await fetchMuscleFile('pectorals', 'es', { fetchImpl: cdn.fetch, sleep: noWait });

    expect(file.muscle).toBe('pectorals');
    expect(file.exercises).toHaveLength(2);
    expect(cdn.calls).toHaveLength(1);
  });

  it('reintenta un 503 y se queda con la respuesta buena', async () => {
    let attempts = 0;
    const flaky: typeof fetch = () => {
      attempts += 1;
      return Promise.resolve(
        attempts < 3
          ? new Response('busy', { status: 503 })
          : Response.json(muscleFile('abductors', [])),
      );
    };

    const file = await fetchMuscleFile('abductors', 'es', { fetchImpl: flaky, sleep: noWait });

    expect(attempts).toBe(3);
    expect(file.count).toBe(0);
  });

  it('espera más en cada reintento antes de rendirse', async () => {
    const waits: number[] = [];
    const alwaysDown: typeof fetch = () => Promise.resolve(new Response('down', { status: 500 }));

    await expect(
      fetchMuscleFile('abs', 'es', {
        fetchImpl: alwaysDown,
        sleep: (ms) => {
          waits.push(ms);
          return Promise.resolve();
        },
        initialBackoffMs: 100,
      }),
    ).rejects.toBeInstanceOf(CatalogSourceError);

    // Tres intentos y dos esperas entre ellos, cada una el doble de la anterior.
    expect(waits).toEqual([100, 200]);
  });

  it('no reintenta un 404: el fichero no está donde creemos y no va a aparecer', async () => {
    let attempts = 0;
    const missing: typeof fetch = () => {
      attempts += 1;
      return Promise.resolve(new Response('nope', { status: 404 }));
    };

    await expect(
      fetchMuscleFile('quads', 'es', { fetchImpl: missing, sleep: noWait }),
    ).rejects.toBeInstanceOf(CatalogSourceError);
    expect(attempts).toBe(1);
  });

  it('reintenta un corte de red y acaba fallando con el número de intentos', async () => {
    let attempts = 0;
    const offline: typeof fetch = () => {
      attempts += 1;
      return Promise.reject(new Error('network down'));
    };

    await expect(
      fetchMuscleFile('traps', 'es', { fetchImpl: offline, sleep: noWait, maxAttempts: 4 }),
    ).rejects.toMatchObject({ name: 'CatalogSourceError', attempts: 4 });
    expect(attempts).toBe(4);
  });

  it('rechaza sin reintentar un cuerpo que no cumple el contrato del catálogo', async () => {
    let attempts = 0;
    const wrongShape: typeof fetch = () => {
      attempts += 1;
      return Promise.resolve(Response.json({ muscle: 'chest', count: 0, exercises: [] }));
    };

    // "chest" es un bodyPart, no un músculo: si esto colara, el snapshot quedaría con una
    // carpeta de GIFs que no existe.
    await expect(
      fetchMuscleFile('pectorals', 'es', { fetchImpl: wrongShape, sleep: noWait }),
    ).rejects.toBeInstanceOf(CatalogSourceError);
    expect(attempts).toBe(1);
  });
});
