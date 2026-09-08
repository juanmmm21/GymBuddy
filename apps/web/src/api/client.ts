import { apiErrorSchema, type ApiErrorCode } from '@gymbuddy/shared';
import type { ZodType } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PATCH';

export type QueryParams = Readonly<Record<string, string | number | boolean | undefined>>;

export interface ApiRequest<T> {
  readonly method: HttpMethod;
  readonly path: string;
  /** Esquema del contrato con el que se valida la respuesta antes de devolverla. */
  readonly schema: ZodType<T>;
  readonly query?: QueryParams;
  readonly body?: unknown;
}

export interface ApiClientOptions {
  /** Origen del Worker, sin barra final. Vacío significa el mismo origen que la PWA. */
  readonly baseUrl: string;
  readonly getToken: () => string | null;
  /** Para los tests y para la cola offline: ninguna petición sale por un `fetch` global implícito. */
  readonly fetchImpl?: typeof fetch;
  /** El Worker rechazó la sesión: la PWA la descarta y vuelve a la entrada. */
  readonly onUnauthorized?: () => void;
}

/** El Worker respondió con el contrato de error: la PWA decide mirando `code`. */
export class ApiRequestError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly detail: unknown;

  constructor(code: ApiErrorCode, status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/** No hubo respuesta: sin cobertura, DNS caído, petición abortada. Se reintenta más tarde. */
export class ApiTransportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApiTransportError';
  }
}

/** Hubo respuesta pero no cumple el contrato: un despliegue desalineado entre Worker y PWA. */
export class ApiContractError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiContractError';
    this.status = status;
  }
}

const API_PREFIX = '/api/v1';

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly onUnauthorized: (() => void) | undefined;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.getToken = options.getToken;
    // Se ata al `globalThis` explícitamente: un `fetch` suelto pierde su `this` en el navegador.
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.onUnauthorized = options.onUnauthorized;
  }

  async request<T>(request: ApiRequest<T>): Promise<T> {
    const url = this.buildUrl(request.path, request.query);
    const headers = new Headers({ Accept: 'application/json' });
    const token = this.getToken();
    if (token !== null) headers.set('Authorization', `Bearer ${token}`);
    if (request.body !== undefined) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: request.method,
        headers,
        body: request.body === undefined ? null : JSON.stringify(request.body),
      });
    } catch (error) {
      throw new ApiTransportError(
        `No se pudo contactar con el servidor (${request.method} ${request.path})`,
        {
          cause: error,
        },
      );
    }

    const payload: unknown = await readJson(response);

    if (!response.ok) {
      throw this.toRequestError(response.status, payload, request);
    }

    const parsed = request.schema.safeParse(payload);
    if (!parsed.success) {
      console.error(
        'Respuesta fuera de contrato',
        request.method,
        request.path,
        parsed.error.issues,
      );
      throw new ApiContractError(
        `La respuesta de ${request.method} ${request.path} no cumple el contrato`,
        response.status,
      );
    }

    return parsed.data;
  }

  private buildUrl(path: string, query: QueryParams | undefined): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) search.set(key, String(value));
    }
    const serialized = search.toString();
    return `${this.baseUrl}${API_PREFIX}${path}${serialized === '' ? '' : `?${serialized}`}`;
  }

  private toRequestError(status: number, payload: unknown, request: ApiRequest<unknown>): Error {
    const parsed = apiErrorSchema.safeParse(payload);
    if (!parsed.success) {
      // Un 502 del proxy o una página HTML no traen el contrato: se tratan como fallo
      // del servidor, distinguible del "sin red" para que la cola offline no reintente en bucle.
      return new ApiContractError(
        `El servidor respondió ${String(status)} sin el contrato de error (${request.method} ${request.path})`,
        status,
      );
    }

    const { code, message, detail } = parsed.data.error;
    if (code === 'unauthorized') this.onUnauthorized?.();

    return new ApiRequestError(code, status, message, detail);
  }
}

/** Un cuerpo vacío o no JSON no debe reventar aquí: la decisión la toma quien mira el estado. */
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
