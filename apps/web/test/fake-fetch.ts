import { apiError, type ApiErrorCode } from '@gymbuddy/shared';

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Headers;
  readonly body: unknown;
}

export type FakeHandler = (request: RecordedRequest) => Response | Promise<Response>;

export interface FakeFetch {
  readonly fetch: typeof fetch;
  readonly requests: RecordedRequest[];
  /** Registra la respuesta de una ruta; `path` es lo que va después de `/api/v1`. */
  on(method: string, path: string, handler: FakeHandler): void;
}

/**
 * Un `fetch` falso enrutado por método y ruta. Ningún test toca la red: lo que no esté
 * registrado responde 404 con el contrato de error, como haría el Worker.
 */
export function createFakeFetch(): FakeFetch {
  const handlers = new Map<string, FakeHandler>();
  const requests: RecordedRequest[] = [];

  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    );
    const method = init?.method ?? 'GET';
    const path = url.pathname.replace(/^\/api\/v1/, '') + url.search;
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
    const request: RecordedRequest = { method, path, headers: new Headers(init?.headers), body };
    requests.push(request);

    const handler = handlers.get(key(method, url.pathname.replace(/^\/api\/v1/, '')));
    if (handler === undefined)
      return errorResponse('not_found', 404, `Sin ruta para ${method} ${path}`);
    return handler(request);
  };

  return {
    fetch: fakeFetch,
    requests,
    on(method, path, handler) {
      handlers.set(key(method, path), handler);
    },
  };
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(code: ApiErrorCode, status: number, message: string): Response {
  return jsonResponse(apiError(code, message), status);
}

function key(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}
