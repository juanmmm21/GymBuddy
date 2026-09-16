import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../src/api/client';
import {
  requestRestNotice,
  restNoticeKey,
  restNoticeRequestFor,
  withdrawRestNotice,
} from '../../src/features/session/rest-notice';
import { createFakeFetch, errorResponse, type FakeFetch } from '../fake-fetch';

const SESSION_ID = 'e19a7b3c-4d5e-4f61-9a2b-3c4d5e6f7a8b';
const LAST_SET_AT = '2026-09-16T18:00:00.000Z';
const NOW = Date.parse('2026-09-16T18:00:30.000Z');

function clientFor(fake: FakeFetch): ApiClient {
  return new ApiClient({ baseUrl: '', getToken: () => 'token', fetchImpl: fake.fetch });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('qué aviso de descanso toca programar', () => {
  it('acaba cuando el temporizador llega a cero: la última serie más el objetivo', () => {
    expect(
      restNoticeRequestFor({
        sessionId: SESSION_ID,
        lastSetAt: LAST_SET_AT,
        targetSeconds: 120,
        cardioStartedAt: null,
        now: NOW,
      }),
    ).toEqual({ sessionId: SESSION_ID, endsAt: '2026-09-16T18:02:00.000Z' });
  });

  it('una última serie con otra zona horaria da el mismo instante en UTC', () => {
    expect(
      restNoticeRequestFor({
        sessionId: SESSION_ID,
        lastSetAt: '2026-09-16T20:00:00+02:00',
        targetSeconds: 90,
        cardioStartedAt: null,
        now: NOW,
      })?.endsAt,
    ).toBe('2026-09-16T18:01:30.000Z');
  });

  it('sin series no hay descanso que avisar', () => {
    expect(
      restNoticeRequestFor({
        sessionId: SESSION_ID,
        lastSetAt: null,
        targetSeconds: 120,
        cardioStartedAt: null,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('con un cardio en marcha no se avisa', () => {
    expect(
      restNoticeRequestFor({
        sessionId: SESSION_ID,
        lastSetAt: LAST_SET_AT,
        targetSeconds: 120,
        cardioStartedAt: '2026-09-16T18:00:20.000Z',
        now: NOW,
      }),
    ).toBeNull();
  });

  it('un descanso ya cumplido, o que se cumple justo ahora, no se avisa', () => {
    const at = (now: number) =>
      restNoticeRequestFor({
        sessionId: SESSION_ID,
        lastSetAt: LAST_SET_AT,
        targetSeconds: 60,
        cardioStartedAt: null,
        now,
      });

    expect(at(Date.parse('2026-09-16T18:01:00.000Z'))).toBeNull();
    expect(at(Date.parse('2026-09-16T18:05:00.000Z'))).toBeNull();
    expect(at(Date.parse('2026-09-16T18:00:59.999Z'))).not.toBeNull();
  });

  it('una fecha ilegible no programa nada', () => {
    expect(
      restNoticeRequestFor({
        sessionId: SESSION_ID,
        lastSetAt: 'ayer',
        targetSeconds: 120,
        cardioStartedAt: null,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('la clave distingue la hora de fin y la sesión', () => {
    const request = { sessionId: SESSION_ID, endsAt: '2026-09-16T18:02:00.000Z' };
    expect(restNoticeKey(request)).toBe(restNoticeKey({ ...request }));
    expect(restNoticeKey(request)).not.toBe(
      restNoticeKey({ ...request, endsAt: '2026-09-16T18:03:00.000Z' }),
    );
    expect(restNoticeKey(null)).toBeNull();
  });
});

describe('pedir y quitar el aviso al Worker', () => {
  const request = { sessionId: SESSION_ID, endsAt: '2026-09-16T18:02:00.000Z' };

  it('lo programa con un PUT y lo quita con un DELETE', async () => {
    const fake = createFakeFetch();
    fake.on('PUT', '/push/rest-notice', () => new Response(null, { status: 204 }));
    fake.on('DELETE', '/push/rest-notice', () => new Response(null, { status: 204 }));
    const client = clientFor(fake);

    await requestRestNotice(client, request);
    await withdrawRestNotice(client);

    expect(fake.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: 'PUT', path: '/push/rest-notice', body: request },
      { method: 'DELETE', path: '/push/rest-notice', body: null },
    ]);
  });

  it('una sesión cerrada o que el Worker aún no conoce se ignora sin registrar nada', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fake = createFakeFetch();
    const client = clientFor(fake);

    fake.on('PUT', '/push/rest-notice', () =>
      errorResponse('session_closed', 409, 'Esa sesión ya está cerrada'),
    );
    await expect(requestRestNotice(client, request)).resolves.toBeUndefined();
    fake.on('PUT', '/push/rest-notice', () =>
      errorResponse('not_found', 404, 'No existe esa sesión'),
    );
    await expect(requestRestNotice(client, request)).resolves.toBeUndefined();

    expect(warn).not.toHaveBeenCalled();
  });

  it('sin red no lanza: lo registra y la serie sigue su camino', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const offline = new ApiClient({
      baseUrl: '',
      getToken: () => 'token',
      fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')),
    });

    await expect(requestRestNotice(offline, request)).resolves.toBeUndefined();
    await expect(withdrawRestNotice(offline)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(2);
  });
});
