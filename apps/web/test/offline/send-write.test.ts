import { describe, expect, it } from 'vitest';
import {
  ApiClient,
  ApiContractError,
  ApiRequestError,
  ApiTransportError,
} from '../../src/api/client';
import { handleWriteFailure, sendSessionWrite } from '../../src/offline/send-write';
import { createFakeFetch, jsonResponse } from '../fake-fetch';
import { activeSession, benchPress } from '../fixtures';

describe('handleWriteFailure', () => {
  it('sin red se reintenta más tarde', () => {
    expect(handleWriteFailure(new ApiTransportError('sin red'))).toBe('retry_later');
  });

  it('el servidor caído o saturado se reintenta; un 4xx sin contrato se descarta', () => {
    expect(handleWriteFailure(new ApiContractError('502', 502))).toBe('retry_later');
    expect(handleWriteFailure(new ApiContractError('429', 429))).toBe('retry_later');
    expect(handleWriteFailure(new ApiContractError('408', 408))).toBe('retry_later');
    expect(handleWriteFailure(new ApiContractError('413', 413))).toBe('discard');
  });

  it('un 2xx fuera de contrato ya entró y no se vuelve a mandar', () => {
    expect(handleWriteFailure(new ApiContractError('200', 200))).toBe('already_applied');
  });

  it('la sesión caducada guarda la escritura para cuando se vuelva a entrar', () => {
    expect(handleWriteFailure(new ApiRequestError('unauthorized', 401, 'caducada'))).toBe(
      'retry_later',
    );
  });

  it('un fallo interno del Worker se reintenta', () => {
    expect(handleWriteFailure(new ApiRequestError('internal_error', 500, 'roto'))).toBe(
      'retry_later',
    );
  });

  it('un rechazo del Worker se descarta: repetirlo daría lo mismo', () => {
    for (const code of [
      'session_closed',
      'conflicting_write',
      'validation_failed',
      'not_found',
    ] as const) {
      expect(handleWriteFailure(new ApiRequestError(code, 409, code))).toBe('discard');
    }
  });

  it('un error que no viene del cliente de la API no se reintenta en bucle', () => {
    expect(handleWriteFailure(new TypeError('bug'))).toBe('discard');
  });
});

describe('sendSessionWrite', () => {
  it('cada escritura va a su ruta con su método y su cuerpo', async () => {
    const fake = createFakeFetch();
    const base = `/sessions/${activeSession.id}`;
    const setId = activeSession.sets[0]?.id ?? '';
    const closed = {
      id: activeSession.id,
      startedAt: activeSession.startedAt,
      endedAt: '2026-09-08T19:00:00.000Z',
      notes: null,
    };
    fake.on('POST', '/sessions', () => jsonResponse({ ...closed, endedAt: null }));
    fake.on('POST', `${base}/sets`, () =>
      jsonResponse({ set: activeSession.sets[0], records: [] }),
    );
    fake.on('PATCH', `${base}/sets/${setId}`, () =>
      jsonResponse({ set: activeSession.sets[0], records: [] }),
    );
    fake.on('DELETE', `${base}/sets/${setId}`, () => new Response(null, { status: 204 }));
    fake.on('POST', `${base}/end`, () => jsonResponse(closed));
    const client = new ApiClient({ baseUrl: '', getToken: () => 'token', fetchImpl: fake.fetch });

    await sendSessionWrite(client, {
      kind: 'start_session',
      body: { id: activeSession.id, startedAt: activeSession.startedAt },
    });
    await sendSessionWrite(client, {
      kind: 'log_set',
      sessionId: activeSession.id,
      body: {
        id: setId,
        trackedExerciseId: benchPress.id,
        weight: '82.50',
        reps: 8,
        completedAt: '2026-09-08T18:10:00.000Z',
      },
    });
    await sendSessionWrite(client, {
      kind: 'update_set',
      sessionId: activeSession.id,
      setId,
      body: { reps: 7 },
    });
    await expect(
      sendSessionWrite(client, { kind: 'remove_set', sessionId: activeSession.id, setId }),
    ).resolves.toBeNull();
    await sendSessionWrite(client, {
      kind: 'end_session',
      sessionId: activeSession.id,
      body: { endedAt: '2026-09-08T19:00:00.000Z' },
    });

    expect(fake.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'POST /sessions',
      `POST ${base}/sets`,
      `PATCH ${base}/sets/${setId}`,
      `DELETE ${base}/sets/${setId}`,
      `POST ${base}/end`,
    ]);
    expect(fake.requests[1]?.body).toMatchObject({ completedAt: '2026-09-08T18:10:00.000Z' });
    expect(fake.requests[2]?.body).toEqual({ reps: 7 });
  });
});
