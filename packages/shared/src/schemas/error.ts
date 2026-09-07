import { z } from 'zod';

/**
 * Códigos de error de la API. Son parte del contrato: el Worker responde con uno
 * de ellos y la PWA decide qué hacer mirando el código, nunca el texto del mensaje
 * (que es para humanos y está sujeto a traducción).
 */
export const apiErrorCodeSchema = z.enum(['validation_failed', 'not_found', 'internal_error']);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    detail: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * Construye el cuerpo de error del contrato. Existe para que ningún sitio arme el
 * objeto a mano y se desvíe de la forma que la PWA espera.
 */
export function apiError(code: ApiErrorCode, message: string, detail?: unknown): ApiError {
  return detail === undefined ? { error: { code, message } } : { error: { code, message, detail } };
}
