import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiRequestError, ApiTransportError } from '../../src/api/client';
import {
  downloadExerciseMedia,
  removeExerciseMedia,
  uploadExercisePhoto,
} from '../../src/api/endpoints';
import { errorResponse, jsonResponse } from '../fake-fetch';
import { customCurl } from '../fixtures';

const MEDIA_ID = '4f1d2c3b-5a6e-4b7c-8d9e-0f1a2b3c4d5e';

interface Captured {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

/** Un `fetch` que guarda la petición tal cual: el falso común solo entiende cuerpos JSON. */
function capturingFetch(respond: () => Response): { fetch: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return Promise.resolve(respond());
  };

  return { fetch: fetchImpl, calls };
}

function clientWith(fetchImpl: typeof fetch): ApiClient {
  return new ApiClient({ baseUrl: '', getToken: () => 'token-123', fetchImpl });
}

describe('ApiClient: ficheros', () => {
  it('sube la foto como cuerpo con su tipo y valida la ficha que vuelve', async () => {
    const withPhoto = {
      ...customCurl,
      media: {
        id: MEDIA_ID,
        kind: 'photo',
        contentType: 'image/jpeg',
        bytes: 3,
        uploadedAt: '2026-09-16T20:00:00.000Z',
      },
    };
    const captured = capturingFetch(() => jsonResponse(withPhoto));
    const photo = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

    const exercise = await uploadExercisePhoto(clientWith(captured.fetch), customCurl.id, photo);

    expect(exercise.media?.id).toBe(MEDIA_ID);
    const [call] = captured.calls;
    expect(call?.url).toBe(`/api/v1/exercises/${customCurl.id}/media`);
    expect(call?.init?.method).toBe('PUT');
    expect(call?.init?.body).toBe(photo);
    const headers = new Headers(call?.init?.headers);
    expect(headers.get('Content-Type')).toBe('image/jpeg');
    expect(headers.get('Authorization')).toBe('Bearer token-123');
  });

  it('quitar la foto es un DELETE sin cuerpo', async () => {
    const captured = capturingFetch(() => jsonResponse(customCurl));

    await removeExerciseMedia(clientWith(captured.fetch), customCurl.id);

    expect(captured.calls[0]?.init?.method).toBe('DELETE');
    expect(captured.calls[0]?.init?.body).toBeNull();
  });

  it('descarga el fichero con la sesión y lo devuelve como blob', async () => {
    const captured = capturingFetch(
      () => new Response(new Uint8Array([9, 8, 7]), { headers: { 'content-type': 'image/jpeg' } }),
    );

    const blob = await downloadExerciseMedia(clientWith(captured.fetch), customCurl.id, MEDIA_ID);

    expect(captured.calls[0]?.url).toBe(`/api/v1/exercises/${customCurl.id}/media/${MEDIA_ID}`);
    expect(new Headers(captured.calls[0]?.init?.headers).get('Authorization')).toBe(
      'Bearer token-123',
    );
    expect(new Uint8Array(await blob.arrayBuffer())).toStrictEqual(new Uint8Array([9, 8, 7]));
  });

  it('una descarga que el Worker rechaza es un error del contrato con su código', async () => {
    const captured = capturingFetch(() => errorResponse('not_found', 404, 'Esa foto no existe'));

    await expect(
      downloadExerciseMedia(clientWith(captured.fetch), customCurl.id, MEDIA_ID),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
    await expect(
      downloadExerciseMedia(clientWith(captured.fetch), customCurl.id, MEDIA_ID),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('una subida sin red es un error de transporte', async () => {
    const failing = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Load failed'));

    await expect(
      uploadExercisePhoto(
        clientWith(failing),
        customCurl.id,
        new Blob(['x'], { type: 'image/jpeg' }),
      ),
    ).rejects.toBeInstanceOf(ApiTransportError);
  });
});
