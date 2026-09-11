import { userSchema } from '@gymbuddy/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  ApiClient,
  ApiContractError,
  ApiRequestError,
  ApiTransportError,
} from '../../src/api/client';
import { fetchCurrentUser, listSessionHistory, logSet } from '../../src/api/endpoints';
import { createFakeFetch, errorResponse, jsonResponse } from '../fake-fetch';
import { sessionPage, user } from '../fixtures';

function createClient(fetchImpl: typeof fetch, token: string | null = 'token-123') {
  const onUnauthorized = vi.fn();
  const client = new ApiClient({
    baseUrl: 'https://api.example.test/',
    getToken: () => token,
    fetchImpl,
    onUnauthorized,
  });
  return { client, onUnauthorized };
}

describe('ApiClient', () => {
  it('manda el token, valida la respuesta con el contrato y la devuelve tipada', async () => {
    const fake = createFakeFetch();
    fake.on('GET', '/auth/me', () => jsonResponse(user));
    const { client } = createClient(fake.fetch);

    const me = await fetchCurrentUser(client);

    expect(me).toEqual(user);
    expect(fake.requests[0]?.headers.get('Authorization')).toBe('Bearer token-123');
    expect(fake.requests[0]?.headers.get('Content-Type')).toBeNull();
  });

  it('serializa el cuerpo y solo los parámetros de consulta definidos', async () => {
    const fake = createFakeFetch();
    fake.on('GET', '/history/sessions', () => jsonResponse(sessionPage));
    fake.on('POST', '/sessions/abc/sets', (request) => {
      expect(request.body).toMatchObject({ weight: '82.50', reps: 8 });
      return errorResponse('session_closed', 409, 'La sesión ya se cerró');
    });
    const { client } = createClient(fake.fetch);

    // `offset`, `from` y `to` no se piden: no pueden aparecer como "undefined" en la URL.
    await listSessionHistory(client, { limit: 10 });
    expect(fake.requests[0]?.path).toBe('/history/sessions?limit=10');

    await expect(
      logSet(client, 'abc', {
        id: '00000000-0000-4000-8000-000000000001',
        trackedExerciseId: '00000000-0000-4000-8000-000000000002',
        weight: '82.50',
        reps: 8,
        source: 'web',
      }),
    ).rejects.toMatchObject({ name: 'ApiRequestError', code: 'session_closed', status: 409 });
    expect(fake.requests[1]?.headers.get('Content-Type')).toBe('application/json');
  });

  it('sin token no manda cabecera de autorización', async () => {
    const fake = createFakeFetch();
    fake.on('GET', '/auth/me', () => jsonResponse(user));
    const { client } = createClient(fake.fetch, null);

    await fetchCurrentUser(client);
    expect(fake.requests[0]?.headers.has('Authorization')).toBe(false);
  });

  it('un 401 del contrato avisa para cerrar la sesión', async () => {
    const fake = createFakeFetch();
    fake.on('GET', '/auth/me', () => errorResponse('unauthorized', 401, 'Sin sesión'));
    const { client, onUnauthorized } = createClient(fake.fetch);

    await expect(fetchCurrentUser(client)).rejects.toBeInstanceOf(ApiRequestError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('una respuesta que no cumple el contrato es un error de contrato, no un dato', async () => {
    const fake = createFakeFetch();
    fake.on('GET', '/auth/me', () => jsonResponse({ ...user, displayName: 42 }));
    const { client } = createClient(fake.fetch);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(fetchCurrentUser(client)).rejects.toBeInstanceOf(ApiContractError);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('un error sin el contrato (HTML de un proxy) también es error de contrato', async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(new Response('<html>502</html>', { status: 502 }));
    const { client, onUnauthorized } = createClient(fetchImpl);

    await expect(fetchCurrentUser(client)).rejects.toMatchObject({
      name: 'ApiContractError',
      status: 502,
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('un fallo de red es un error de transporte con su causa', async () => {
    const cause = new TypeError('Failed to fetch');
    const fetchImpl: typeof fetch = () => Promise.reject(cause);
    const { client } = createClient(fetchImpl);

    const error = await fetchCurrentUser(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiTransportError);
    expect((error as ApiTransportError).cause).toBe(cause);
  });

  it('compone la URL con el prefijo de versión y sin barras dobles', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(user)));
    const client = new ApiClient({
      baseUrl: 'https://api.example.test///',
      getToken: () => null,
      fetchImpl,
    });

    await client.request({ method: 'GET', path: '/auth/me', schema: userSchema });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.example.test/api/v1/auth/me');
  });
});
