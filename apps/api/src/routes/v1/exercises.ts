import {
  createTrackedExerciseRequestSchema,
  localeSchema,
  updateTrackedExerciseRequestSchema,
} from '@gymbuddy/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { createDatabase } from '../../db/client';
import { requireUser, type AuthenticatedEnv } from '../../http/current-user';
import { parseJsonBody, parseQuery } from '../../http/query';
import {
  createTrackedExercise,
  exerciseNotFound,
  findTrackedExercise,
  listTrackedExercises,
  putExerciseMedia,
  readExerciseMedia,
  removeExerciseMedia,
  updateTrackedExercise,
} from '../../training/index';

/**
 * El idioma sale del perfil salvo que se pida otro: solo afecta al nombre que viene del
 * catálogo, porque el de un ejercicio propio lo escribió el usuario.
 */
const listQuerySchema = z.object({
  lang: localeSchema.optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

const detailQuerySchema = z.object({ lang: localeSchema.optional() });

export const exercisesRoute = new Hono<AuthenticatedEnv>()
  .use('/exercises', requireUser)
  .use('/exercises/*', requireUser)

  .get('/exercises', async (c) => {
    const user = c.get('user');
    const { lang, includeArchived } = parseQuery(c, listQuerySchema);

    return c.json(
      await listTrackedExercises(createDatabase(c.env.DB), user.id, {
        locale: lang ?? user.locale,
        includeArchived,
      }),
    );
  })

  .post('/exercises', async (c) => {
    const user = c.get('user');
    const request = await parseJsonBody(c, createTrackedExerciseRequestSchema);

    const { exercise, created } = await createTrackedExercise(
      createDatabase(c.env.DB),
      user.id,
      request,
      user.locale,
      new Date(),
    );

    // 200 en el reenvío: la cola offline repite el alta y eso no es un recurso nuevo.
    return c.json(exercise, created ? 201 : 200);
  })

  .get('/exercises/:id', async (c) => {
    const user = c.get('user');
    const { lang } = parseQuery(c, detailQuerySchema);
    const exerciseId = c.req.param('id');

    const exercise = await findTrackedExercise(
      createDatabase(c.env.DB),
      user.id,
      exerciseId,
      lang ?? user.locale,
    );
    if (exercise === null) throw exerciseNotFound(exerciseId);

    return c.json(exercise);
  })

  /**
   * Pone o sustituye la foto o el vídeo de la técnica. El cuerpo es el fichero tal cual (ya
   * re-codificado en el móvil), no JSON: así pasa a R2 en streaming. Responde el ejercicio con su medio nuevo.
   */
  .put('/exercises/:id/media', async (c) => {
    const user = c.get('user');

    return c.json(
      await putExerciseMedia(
        createDatabase(c.env.DB),
        c.env.MEDIA,
        user.id,
        c.req.param('id'),
        {
          headers: {
            contentType: c.req.header('content-type'),
            contentLength: c.req.header('content-length'),
          },
          body: c.req.raw.body,
        },
        user.locale,
        new Date(),
      ),
    );
  })

  /** Quita la foto o el vídeo y devuelve el ejercicio sin él. Repetirlo no falla. */
  .delete('/exercises/:id/media', async (c) => {
    const user = c.get('user');

    return c.json(
      await removeExerciseMedia(
        createDatabase(c.env.DB),
        c.env.MEDIA,
        user.id,
        c.req.param('id'),
        user.locale,
      ),
    );
  })

  /**
   * El fichero. La dirección cambia con cada subida, así que se cachea para siempre; es `private`
   * porque lleva la sesión y ningún intermediario debe guardarlo.
   */
  .get('/exercises/:id/media/:mediaId', async (c) => {
    const object = await readExerciseMedia(
      createDatabase(c.env.DB),
      c.env.MEDIA,
      c.get('user').id,
      c.req.param('id'),
      c.req.param('mediaId'),
    );

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('content-length', String(object.size));
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'private, max-age=31536000, immutable');

    return new Response(object.body, { headers });
  })

  .patch('/exercises/:id', async (c) => {
    const user = c.get('user');
    const request = await parseJsonBody(c, updateTrackedExerciseRequestSchema);

    return c.json(
      await updateTrackedExercise(
        createDatabase(c.env.DB),
        user.id,
        c.req.param('id'),
        request,
        user.locale,
        new Date(),
      ),
    );
  });
