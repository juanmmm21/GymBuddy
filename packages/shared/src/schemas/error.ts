import { z } from 'zod';

/**
 * Códigos de error de la API. Son parte del contrato: el Worker responde con uno
 * de ellos y la PWA decide qué hacer mirando el código, nunca el texto del mensaje
 * (que es para humanos y está sujeto a traducción).
 */
export const apiErrorCodeSchema = z.enum([
  'validation_failed',
  'not_found',
  // Sin sesión válida: falta el JWT, está caducado o no lo firmamos nosotros.
  'unauthorized',
  // El código de invitación no sirve: no existe, caducó o ya se usó. Los tres casos comparten
  // código a propósito, para no confirmarle a nadie que un código existió.
  'invitation_invalid',
  // El código de «añadir otro dispositivo» no sirve: no existe, caducó o ya se usó. Va aparte de
  // `invitation_invalid` porque el texto que hay que enseñar es otro: aquí se pide otro código
  // desde el móvil que ya tiene la cuenta, no a quien te invitó.
  'device_link_invalid',
  // La passkey no se pudo comprobar: el reto caducó o ya se usó, la firma no cuadra o la llave
  // no es de ninguna cuenta. Es un 400 y no un 401: quien intenta entrar no tiene sesión que
  // cerrar, y la PWA cierra la sesión ante cualquier 401.
  'passkey_invalid',
  // El catálogo externo no respondió y el snapshot no puede refrescarse: es un fallo
  // del origen, no nuestro, y la PWA debe poder distinguirlo para reintentar más tarde.
  'catalog_unavailable',
  // El ejercicio del catálogo ya está en "mis ejercicios": seguirlo dos veces partiría su
  // historial en dos fichas. La PWA lo trata abriendo el que ya existe, no como un fallo.
  'exercise_already_tracked',
  // Ya hay una sesión sin cerrar. Solo se entrena una cosa a la vez, y abrir otra dejaría
  // la anterior huérfana; el `detail` lleva el id de la que sigue abierta.
  'session_already_open',
  // La sesión ya se cerró: sus series no se tocan. Es lo que ve la cola offline cuando
  // reenvía una serie de una sesión que se cerró desde el bot mientras no había red.
  'session_closed',
  // Ese identificador ya existe con otro contenido. La cola offline reenvía la misma
  // escritura una y otra vez, así que repetir es normal; cambiarla por debajo, no.
  'conflicting_write',
  'internal_error',
]);

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
