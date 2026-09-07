import type { HealthResponse } from '@gymbuddy/shared';
import { Hono } from 'hono';
import { API_VERSION } from '../../version';

export const healthRoute = new Hono<{ Bindings: Env }>().get('/health', (c) => {
  const body: HealthResponse = {
    status: 'ok',
    service: 'gymbuddy-api',
    version: API_VERSION,
    time: new Date().toISOString(),
  };

  return c.json(body);
});
