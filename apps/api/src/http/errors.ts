import type { ApiErrorCode } from '@gymbuddy/shared';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export const httpStatusByErrorCode: Record<ApiErrorCode, ContentfulStatusCode> = {
  validation_failed: 400,
  not_found: 404,
  unauthorized: 401,
  invitation_invalid: 400,
  device_link_invalid: 400,
  // 409: la petición es válida, pero contradice lo que esa cuenta ya tiene guardado.
  invitation_limit_reached: 409,
  passkey_invalid: 400,
  // 503 y no 502: el origen es un CDN inmutable, así que el fallo es transitorio y
  // reintentar más tarde es la respuesta correcta.
  catalog_unavailable: 503,
  // Los cuatro choques del registro de entrenamiento son 409: la petición es válida y
  // está autorizada, pero contradice el estado que ya hay guardado.
  exercise_already_tracked: 409,
  session_already_open: 409,
  session_closed: 409,
  conflicting_write: 409,
  import_conflict: 409,
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
