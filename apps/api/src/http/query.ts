import type { Context } from 'hono';
import type { ZodType } from 'zod';
import { ApiException } from './errors';

/**
 * Valida la cadena de consulta con un esquema Zod y traduce el fallo al contrato de error.
 * Sin esto cada ruta parsearía sus parámetros a mano y "?limit=abc" acabaría en un NaN
 * viajando hasta la consulta SQL.
 */
export function parseQuery<T>(c: Context, schema: ZodType<T>): T {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) {
    throw new ApiException(
      'validation_failed',
      'Parámetros de consulta inválidos',
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return parsed.data;
}

/**
 * Igual para un parámetro de ruta. Devuelve `not_found` y no `validation_failed`: una
 * parte del cuerpo que no está en el enum es, para el usuario, una URL que no existe.
 */
export function parsePathParam<T>(value: string, schema: ZodType<T>, description: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiException('not_found', `${description}: "${value}"`);
  }

  return parsed.data;
}
