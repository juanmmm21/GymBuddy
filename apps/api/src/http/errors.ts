import type { ApiErrorCode } from '@gymbuddy/shared';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export const httpStatusByErrorCode: Record<ApiErrorCode, ContentfulStatusCode> = {
  validation_failed: 400,
  not_found: 404,
  internal_error: 500,
};

/**
 * Error de dominio que el manejador central traduce al contrato de la API. Cualquier
 * ruta que quiera responder un fallo concreto lanza esto en vez de armar la respuesta.
 */
export class ApiException extends Error {
  readonly code: ApiErrorCode;
  readonly detail: unknown;

  constructor(code: ApiErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiException';
    this.code = code;
    this.detail = detail;
  }
}
