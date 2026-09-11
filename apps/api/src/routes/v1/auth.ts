import { Hono } from 'hono';
import { toUser } from '../../auth/users';
import { requireUser, type AuthenticatedEnv } from '../../http/current-user';

export const authRoute = new Hono<AuthenticatedEnv>().get('/auth/me', requireUser, (c) =>
  c.json(toUser(c.get('user'))),
);
