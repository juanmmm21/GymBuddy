import { z } from 'zod';
import { isoDatetimeSchema } from './common';
import { userSchema } from './user';

/**
 * Lo que devuelve `POST /auth/nonce`. `telegramLink` viene armado por el Worker en vez de
 * componerlo la PWA: así el nombre del bot vive en un único sitio (la configuración del
 * Worker) y cambiarlo no obliga a desplegar también el frontend.
 */
export const loginNonceSchema = z.object({
  nonce: z.string().min(1),
  expiresAt: isoDatetimeSchema,
  telegramLink: z.url(),
});

export const claimSessionRequestSchema = z.object({
  nonce: z.string().min(1),
});

export const sessionSchema = z.object({
  token: z.string().min(1),
  expiresAt: isoDatetimeSchema,
  user: userSchema,
});

/**
 * El canje del nonce no es un sí o un no: entre que la PWA abre el enlace y el usuario
 * pulsa *Start* en Telegram pasan segundos, y ese hueco es funcionamiento normal, no un
 * error. Por eso "todavía nadie ha pulsado" viaja como un estado y no como un 4xx: la PWA
 * reintenta con backoff mientras sea `pending` y se rinde cuando el nonce caduca.
 */
export const claimSessionResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('ready'), session: sessionSchema }),
]);

export type LoginNonce = z.infer<typeof loginNonceSchema>;
export type ClaimSessionRequest = z.infer<typeof claimSessionRequestSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type ClaimSessionResponse = z.infer<typeof claimSessionResponseSchema>;
