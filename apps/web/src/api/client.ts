import {
  apiErrorSchema,
  readSessionRefresh,
  type ApiErrorCode,
  type SessionRefresh,
} from '@gymbuddy/shared';
import type { ZodType } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryParams = Readonly<Record<string, string | number | boolean | undefined>>;

export interface ApiRequest<T> {
  readonly method: HttpMethod;
  readonly path: string;
  /** Esquema del contrato con el que se valida la respuesta antes de devolverla. */
  readonly schema: ZodType<T>;
  readonly query?: QueryParams;
  readonly body?: unknown;
}

/** Un fichero que va como cuerpo, con su tipo en el `Blob`. */
export interface ApiUploadRequest<T> {
  readonly method: 'PUT';
  readonly path: string;
  readonly schema: ZodType<T>;
  readonly file: Blob;
  readonly query?: QueryParams;
}

/** Lo que identifica una petición en los mensajes de error y en la URL. */
interface ApiRequestTarget {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query?: QueryParams;
}

export interface ApiClientOptions {
  /** Origen del Worker, sin barra final. Vacío significa el mismo origen que la PWA. */
  readonly baseUrl: string;
  readonly getToken: () => string | null;
  /** Para los tests y para la cola offline: ninguna petición sale por un `fetch` global implícito. */
  readonly fetchImpl?: typeof fetch;
  /** El Worker rechazó la sesión: la PWA la descarta y vuelve a la entrada. */
  readonly onUnauthorized?: () => void;
  /** El Worker devolvió un token nuevo porque al de esta sesión le quedaba poca vida. */
  readonly onSessionRefreshed?: (refresh: SessionRefresh) => void;
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
  private readonly onSessionRefreshed: ((refresh: SessionRefresh) => void) | undefined;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.getToken = options.getToken;
    // Se ata al `globalThis` explícitamente: un `fetch` suelto pierde su `this` en el navegador.
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.onUnauthorized = options.onUnauthorized;
    this.onSessionRefreshed = options.onSessionRefreshed;
  }

  async request<T>(request: ApiRequest<T>): Promise<T> {
    const response = await this.send(request, {
      body: request.body === undefined ? null : JSON.stringify(request.body),
      contentType: request.body === undefined ? null : 'application/json',
      accept: 'application/json',
    });

    return this.readContract(response, request);
  }

  /**
   * Manda un fichero tal cual como cuerpo (la foto de un ejercicio) y valida la respuesta JSON con
   * el contrato. El navegador pone solo el `Content-Length` de un `Blob`, que el Worker exige.
   */
  async upload<T>(request: ApiUploadRequest<T>): Promise<T> {
    const response = await this.send(request, {
      body: request.file,
      contentType: request.file.type,
      accept: 'application/json',
    });

    return this.readContract(response, request);
  }

  /** Descarga un fichero con la sesión puesta, que es lo que una etiqueta `<img>` no puede hacer. */
  async download(path: string): Promise<Blob> {
    const request = { method: 'GET', path } as const;
    const response = await this.send(request, { body: null, contentType: null, accept: '*/*' });

    if (!response.ok) {
      throw this.toRequestError(response.status, await readJson(response), request);
    }

    try {
      return await response.blob();
    } catch (error) {
      // La conexión se cortó a mitad del fichero: es falta de red, no un fallo del servidor.
      throw new ApiTransportError(`La descarga de ${path} se cortó`, { cause: error });
    }
  }

  private async send(
    request: ApiRequestTarget,
    payload: {
      readonly body: string | Blob | null;
      readonly contentType: string | null;
      readonly accept: string;
    },
  ): Promise<Response> {
    const url = this.buildUrl(request.path, request.query);
    const headers = new Headers({ Accept: payload.accept });
    const token = this.getToken();
    if (token !== null) headers.set('Authorization', `Bearer ${token}`);
    if (payload.contentType !== null) headers.set('Content-Type', payload.contentType);

    let response: Response;
    try {
      response = await this.fetchImpl(url, { method: request.method, headers, body: payload.body });
    } catch (error) {
      throw new ApiTransportError(
        `No se pudo contactar con el servidor (${request.method} ${request.path})`,
        {
          cause: error,
        },
      );
    }

    // La sesión se renueva sola al usarse: el token nuevo viaja en las cabeceras de cualquier
    // respuesta, también en la de un error, así que se recoge antes de mirar el estado.
    const refreshed = readSessionRefresh(response.headers);
    if (refreshed !== null) this.onSessionRefreshed?.(refreshed);

    return response;
  }

  private async readContract<T>(
    response: Response,
    request: ApiRequestTarget & { readonly schema: ZodType<T> },
  ): Promise<T> {
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

  private toRequestError(status: number, payload: unknown, request: ApiRequestTarget): Error {
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
