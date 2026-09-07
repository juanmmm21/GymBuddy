import { describe, expect, it } from 'vitest';
import { apiError, apiErrorSchema, healthResponseSchema } from '../src/index';

describe('apiError', () => {
  it('omite detail cuando no se pasa', () => {
    const body = apiError('not_found', 'El ejercicio no existe');

    expect(body).toEqual({ error: { code: 'not_found', message: 'El ejercicio no existe' } });
    expect('detail' in body.error).toBe(false);
  });

  it('incluye detail cuando se pasa', () => {
    const body = apiError('validation_failed', 'Cuerpo inválido', { field: 'reps' });

    expect(body.error.detail).toEqual({ field: 'reps' });
  });

  it('produce cuerpos que cumplen el esquema del contrato', () => {
    expect(apiErrorSchema.safeParse(apiError('internal_error', 'Fallo inesperado')).success).toBe(
      true,
    );
  });
});

describe('apiErrorSchema', () => {
  it('rechaza códigos fuera del contrato', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'kaboom', message: 'nope' } }).success).toBe(
      false,
    );
  });

  it('rechaza un mensaje vacío: el cliente necesita algo que enseñar', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'not_found', message: '' } }).success).toBe(
      false,
    );
  });
});

describe('healthResponseSchema', () => {
  it('acepta una respuesta con marca de tiempo ISO', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      service: 'gymbuddy-api',
      version: '0.1.0',
      time: '2026-09-07T10:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('rechaza una marca de tiempo que no es ISO 8601', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      service: 'gymbuddy-api',
      version: '0.1.0',
      time: '7 de septiembre de 2026',
    });

    expect(result.success).toBe(false);
  });
});
