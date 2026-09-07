import { apiErrorSchema, healthResponseSchema } from '@gymbuddy/shared';
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('GET /api/v1/health', () => {
  it('responde 200 con el cuerpo que define el contrato', async () => {
    const response = await SELF.fetch('https://gymbuddy.test/api/v1/health');

    expect(response.status).toBe(200);

    const parsed = healthResponseSchema.safeParse(await response.json());
    expect(parsed.success).toBe(true);
  });
});

describe('contrato de errores', () => {
  it('devuelve not_found con la forma del contrato en una ruta inexistente', async () => {
    const response = await SELF.fetch('https://gymbuddy.test/api/v1/no-existe');

    expect(response.status).toBe(404);

    const parsed = apiErrorSchema.safeParse(await response.json());
    expect(parsed.success).toBe(true);
    expect(parsed.data?.error.code).toBe('not_found');
  });
});
