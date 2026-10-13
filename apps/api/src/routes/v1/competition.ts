import { setRivalsRequestSchema } from '@gymbuddy/shared';
import { Hono } from 'hono';
import { createDatabase } from '../../db/client';
import { requireUser, type AuthenticatedEnv } from '../../http/current-user';
import { parseJsonBody } from '../../http/query';
import { getCompetition, listRivalCandidates, setRivals } from '../../training/index';

export const competitionRoute = new Hono<AuthenticatedEnv>()
  .use('/competition', requireUser)
  .use('/competition/*', requireUser)

  /** La clasificación de la semana y el cara a cara por ejercicio con los rivales elegidos. */
  .get('/competition', async (c) => {
    return c.json(await getCompetition(createDatabase(c.env.DB), c.get('user'), new Date()));
  })

  /** A quién se puede elegir y a quién se tiene elegido ya. */
  .get('/competition/rivals', async (c) => {
    return c.json(await listRivalCandidates(createDatabase(c.env.DB), c.get('user')));
  })

  /** Sustituye la lista entera de rivales; repetir la petición deja lo mismo. */
  .put('/competition/rivals', async (c) => {
    const { rivalIds } = await parseJsonBody(c, setRivalsRequestSchema);

    return c.json(await setRivals(createDatabase(c.env.DB), c.get('user'), rivalIds, new Date()));
  });
