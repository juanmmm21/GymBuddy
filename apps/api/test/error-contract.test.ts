import { apiErrorSchema } from '@gymbuddy/shared';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerErrorHandlers } from '../src/http/error-handler';
import { ApiException } from '../src/http/errors';

function appWithFailingRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  registerErrorHandlers(app);

  app.get('/api-exception', () => {
    throw new ApiException('not_found', 'El ejercicio no existe', { catalogId: 'chest/nope' });
  });
  app.get('/http-exception', () => {
    throw new HTTPException(400, { message: 'Petición mal formada' });
  });
  app.get('/boom', () => {
    throw new Error('fallo inesperado en la ruta');
  });

  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerErrorHandlers', () => {
  it('traduce ApiException al contrato conservando el detalle', async () => {
    const response = await appWithFailingRoutes().request('/api-exception');

    expect(response.status).toBe(404);

    const parsed = apiErrorSchema.safeParse(await response.json());
    expect(parsed.success).toBe(true);
    expect(parsed.data?.error.code).toBe('not_found');
    expect(parsed.data?.error.detail).toEqual({ catalogId: 'chest/nope' });
  });

  it('traduce una HTTPException de Hono conservando su status', async () => {
    const response = await appWithFailingRoutes().request('/http-exception');

    expect(response.status).toBe(400);

    const parsed = apiErrorSchema.safeParse(await response.json());
    expect(parsed.success).toBe(true);
    expect(parsed.data?.error.code).toBe('validation_failed');
  });

  it('convierte un error inesperado en internal_error sin filtrar el mensaje interno', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await appWithFailingRoutes().request('/boom');

    expect(response.status).toBe(500);

    const parsed = apiErrorSchema.safeParse(await response.json());
    expect(parsed.success).toBe(true);
    expect(parsed.data?.error.code).toBe('internal_error');
    expect(parsed.data?.error.message).not.toContain('fallo inesperado');
    // El fallo se pierde si no queda en el log del Worker: es el único rastro en el edge.
    expect(logged).toHaveBeenCalledOnce();
  });

  it('responde not_found en una ruta que no existe', async () => {
    const response = await appWithFailingRoutes().request('/no-existe');

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(await response.json()).success).toBe(true);
  });
});
