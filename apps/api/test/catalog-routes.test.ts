import {
  bodyPartSummarySchema,
  catalogExercisePageSchema,
  catalogExerciseSchema,
  catalogExerciseSummarySchema,
  apiErrorSchema,
} from '@gymbuddy/shared';
import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createDatabase, type Database } from '../src/db/client';
import { seedCatalogSnapshot } from './catalog-fixtures';

const BASE = 'https://gymbuddy.test/api/v1';

const summaryListSchema = z.array(catalogExerciseSummarySchema);
const bodyPartListSchema = z.array(bodyPartSummarySchema);

async function getJson(path: string): Promise<{ status: number; body: unknown }> {
  const response = await SELF.fetch(`${BASE}${path}`);
  return { status: response.status, body: await response.json() };
}

describe('rutas del catálogo', () => {
  let db: Database;

  beforeEach(async () => {
    db = createDatabase(env.DB);
    await seedCatalogSnapshot(db);
  });

  it('lista las partes del cuerpo con su recuento', async () => {
    const { status, body } = await getJson('/catalog/bodyparts');

    expect(status).toBe(200);
    const parsed = bodyPartListSchema.parse(body);
    // Las fixtures cubren pecho (2), pierna (1) y espalda (1): son bodyPart, no músculos.
    expect(parsed).toEqual([
      { bodyPart: 'back', exerciseCount: 1 },
      { bodyPart: 'chest', exerciseCount: 2 },
      { bodyPart: 'legs', exerciseCount: 1 },
    ]);
  });

  it('devuelve una página de ejercicios de una parte del cuerpo', async () => {
    const { status, body } = await getJson('/catalog/bodyparts/chest');

    expect(status).toBe(200);
    const page = catalogExercisePageSchema.parse(body);
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.name)).toEqual([
      'Flexión del arquero',
      'Press de banca con barra',
    ]);
    expect(page.items[0]?.muscle).toBe('pectorals');
    expect(page.items[0]?.bodyPart).toBe('chest');
  });

  it('sirve el idioma pedido y ordena por el nombre de ese idioma', async () => {
    const { body } = await getJson('/catalog/bodyparts/chest?lang=en');

    const page = catalogExercisePageSchema.parse(body);
    expect(page.items.map((item) => item.name)).toEqual(['Archer Push Up', 'Barbell Bench Press']);
  });

  it('respeta el límite y el desplazamiento de la página', async () => {
    const { body } = await getJson('/catalog/bodyparts/chest?limit=1&offset=1');

    const page = catalogExercisePageSchema.parse(body);
    expect(page).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.name).toBe('Press de banca con barra');
  });

  it('rechaza un límite fuera de rango con el contrato de error', async () => {
    const { status, body } = await getJson('/catalog/bodyparts/chest?limit=500');

    expect(status).toBe(400);
    expect(apiErrorSchema.parse(body).error.code).toBe('validation_failed');
  });

  it('trata un músculo colado donde va una parte del cuerpo como ruta inexistente', async () => {
    const { status, body } = await getJson('/catalog/bodyparts/pectorals');

    expect(status).toBe(404);
    expect(apiErrorSchema.parse(body).error.code).toBe('not_found');
  });

  it('devuelve la ficha completa de un ejercicio por su catalogId', async () => {
    const { status, body } = await getJson('/catalog/exercises/pectorals/barbell-bench-press');

    expect(status).toBe(200);
    const exercise = catalogExerciseSchema.parse(body);
    expect(exercise.catalogId).toBe('pectorals/barbell-bench-press');
    expect(exercise.name).toBe('Press de banca con barra');
    expect(exercise.secondaryMuscles).toEqual(['triceps', 'delts']);
    expect(exercise.instructions.length).toBeGreaterThan(0);
    expect(exercise.gifUrl).toContain('@v1.1.0/');
  });

  it('sirve las instrucciones en inglés cuando se piden', async () => {
    const { body } = await getJson('/catalog/exercises/pectorals/barbell-bench-press?lang=en');

    const exercise = catalogExerciseSchema.parse(body);
    expect(exercise.name).toBe('Barbell Bench Press');
    expect(exercise.instructions[0]).toContain('Load the bar');
  });

  it('devuelve not_found para un ejercicio que no está en el snapshot', async () => {
    const { status, body } = await getJson('/catalog/exercises/pectorals/no-existe');

    expect(status).toBe(404);
    expect(apiErrorSchema.parse(body).error.code).toBe('not_found');
  });
});

describe('búsqueda del catálogo', () => {
  beforeEach(async () => {
    await seedCatalogSnapshot(createDatabase(env.DB));
  });

  it('encuentra por una palabra suelta del nombre', async () => {
    const { status, body } = await getJson('/catalog/search?q=banca');

    expect(status).toBe(200);
    const results = summaryListSchema.parse(body);
    expect(results.map((item) => item.catalogId)).toEqual(['pectorals/barbell-bench-press']);
  });

  it('ignora los acentos: es lo que teclea alguien con prisa entre series', async () => {
    const { body } = await getJson('/catalog/search?q=flexion');

    expect(summaryListSchema.parse(body).map((item) => item.catalogId)).toEqual([
      'pectorals/archer-push-up',
    ]);
  });

  it('no depende del orden de las palabras', async () => {
    const { body } = await getJson('/catalog/search?q=banca%20press');

    expect(summaryListSchema.parse(body)).toHaveLength(1);
  });

  it('busca también por el nombre en inglés aunque devuelva el nombre en español', async () => {
    const { body } = await getJson('/catalog/search?q=bench%20press');

    const results = summaryListSchema.parse(body);
    expect(results[0]?.catalogId).toBe('pectorals/barbell-bench-press');
    expect(results[0]?.name).toBe('Press de banca con barra');
  });

  it('devuelve todos los que contienen el término', async () => {
    const { body } = await getJson('/catalog/search?q=lateral');

    const results = summaryListSchema.parse(body);
    expect(results.map((item) => item.catalogId).sort()).toEqual([
      'abductors/side-hip-abduction',
      'levator-scapulae/neck-side-stretch',
    ]);
  });

  it('devuelve una lista vacía cuando no hay coincidencias', async () => {
    const { body } = await getJson('/catalog/search?q=zancada%20bulgara');

    expect(summaryListSchema.parse(body)).toEqual([]);
  });

  it('exige algo que buscar', async () => {
    const { status, body } = await getJson('/catalog/search?q=');

    expect(status).toBe(400);
    expect(apiErrorSchema.parse(body).error.code).toBe('validation_failed');
  });

  it('no trata los comodines del LIKE como comodines', async () => {
    const { body } = await getJson('/catalog/search?q=%25');

    // La normalización deja la consulta vacía, así que no puede devolver el catálogo entero.
    expect(summaryListSchema.parse(body)).toEqual([]);
  });
});
