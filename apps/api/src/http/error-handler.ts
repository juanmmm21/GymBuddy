import { apiError, type ApiErrorCode } from '@gymbuddy/shared';
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ApiException, httpStatusByErrorCode } from './errors';

function codeForStatus(status: number): ApiErrorCode {
  if (status === 404) return 'not_found';
  return status >= 500 ? 'internal_error' : 'validation_failed';
}

/**
 * Deja toda la API respondiendo la misma forma de error. Sin esto, un fallo de Hono
 * llega al cliente como texto plano y la PWA no puede distinguirlo de una respuesta buena.
 */
export function registerErrorHandlers(app: Hono<{ Bindings: Env }>): void {
  app.notFound((c) =>
    c.json(apiError('not_found', `No existe la ruta ${c.req.method} ${c.req.path}`), 404),
  );

  app.onError((err, c) => {
    if (err instanceof ApiException) {
      return c.json(apiError(err.code, err.message, err.detail), httpStatusByErrorCode[err.code]);
    }

    if (err instanceof HTTPException) {
      // Se conserva el status original de Hono, más preciso que el genérico del código.
      return c.json(apiError(codeForStatus(err.status), err.message), err.status);
    }

    // Un error inesperado se registra entero: en el edge no hay más rastro que este log.
    console.error('Error no controlado en el Worker', err);
    return c.json(apiError('internal_error', 'Error interno del servidor'), 500);
  });
}
