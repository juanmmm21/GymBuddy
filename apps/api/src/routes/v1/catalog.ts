import { bodyPartSchema, localeSchema, muscleSchema } from '@gymbuddy/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  findCatalogExercise,
  listBodyPartSummaries,
  listExercisesByBodyPart,
  searchCatalogExercises,
} from '../../catalog/index';
import { createDatabase } from '../../db/client';
import { ApiException } from '../../http/errors';
import { parsePathParam, parseQuery } from '../../http/query';

/** Lo que cabe de un tirón en el móvil sin castigar el límite de filas leídas de D1. */
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;

/** El idioma del catálogo. Si no se pide ninguno se sirve español, que es el del usuario. */
const langSchema = localeSchema.default('es');

const pageQuerySchema = z.object({
  lang: langSchema,
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});

const searchQuerySchema = z.object({
  q: z.string().min(1, 'Hace falta algo que buscar'),
  lang: langSchema,
  limit: z.coerce.number().int().min(1).max(MAX_SEARCH_LIMIT).default(DEFAULT_SEARCH_LIMIT),
});

export const catalogRoute = new Hono<{ Bindings: Env }>()
  .get('/catalog/bodyparts', async (c) => {
    return c.json(await listBodyPartSummaries(createDatabase(c.env.DB)));
  })

  .get('/catalog/bodyparts/:bodyPart', async (c) => {
    const bodyPart = parsePathParam(
      c.req.param('bodyPart'),
      bodyPartSchema,
      'No existe esa parte del cuerpo',
    );
    const { lang, limit, offset } = parseQuery(c, pageQuerySchema);

    return c.json(
      await listExercisesByBodyPart(createDatabase(c.env.DB), {
        bodyPart,
        locale: lang,
        limit,
        offset,
      }),
    );
  })

  // El `catalogId` del origen es "{muscle}/{slug}", con barra dentro. Se recibe partido en
  // dos segmentos para que el músculo se valide contra el enum antes de tocar la base.
  .get('/catalog/exercises/:muscle/:slug', async (c) => {
    const muscle = parsePathParam(c.req.param('muscle'), muscleSchema, 'No existe ese músculo');
    const slug = c.req.param('slug');
    const { lang } = parseQuery(c, z.object({ lang: langSchema }));

    const exercise = await findCatalogExercise(createDatabase(c.env.DB), `${muscle}/${slug}`, lang);
    if (exercise === null) {
      throw new ApiException('not_found', `No existe el ejercicio "${muscle}/${slug}"`);
    }

    return c.json(exercise);
  })

  .get('/catalog/search', async (c) => {
    const { q, lang, limit } = parseQuery(c, searchQuerySchema);

    return c.json(
      await searchCatalogExercises(createDatabase(c.env.DB), { query: q, locale: lang, limit }),
    );
  });
