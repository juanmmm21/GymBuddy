import {
  endSessionRequestSchema,
  isoDatetimeSchema,
  logSetRequestSchema,
  resourceIdSchema,
  startSessionRequestSchema,
  updateSetRequestSchema,
} from '@gymbuddy/shared';
import { z } from 'zod';

/*
 * Las marcas de tiempo son obligatorias en lo que se encola aunque el contrato las acepte
 * opcionales: sin ellas el Worker pondría la hora a la que vuelve la red, y una serie hecha a
 * las 18:30 aparecería registrada a las 20:00, con el descanso y el calendario mal.
 */
const startSessionBodySchema = startSessionRequestSchema.required({ startedAt: true });
const logSetBodySchema = logSetRequestSchema.required({ completedAt: true });
const endSessionBodySchema = endSessionRequestSchema.required({ endedAt: true });

/** Lo que se pide escribir, antes de saber si sale directo o espera en la cola. */
export const sessionWriteSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('start_session'), body: startSessionBodySchema }),
  z.object({
    kind: z.literal('log_set'),
    sessionId: resourceIdSchema,
    body: logSetBodySchema,
  }),
  z.object({
    kind: z.literal('update_set'),
    sessionId: resourceIdSchema,
    setId: resourceIdSchema,
    body: updateSetRequestSchema,
  }),
  z.object({
    kind: z.literal('remove_set'),
    sessionId: resourceIdSchema,
    setId: resourceIdSchema,
  }),
  z.object({
    kind: z.literal('end_session'),
    sessionId: resourceIdSchema,
    body: endSessionBodySchema,
  }),
]);

/**
 * Una escritura que espera en la cola. `sequence` fija el orden de envío —abrir la sesión va
 * antes que sus series— y `userId` la ata a la cuenta que la hizo: si en el mismo móvil entra
 * otra persona, sus peticiones no pueden llevarse lo que registró la anterior.
 */
export const pendingWriteSchema = z.object({
  sequence: z.int().nonnegative(),
  userId: resourceIdSchema,
  queuedAt: isoDatetimeSchema,
  write: sessionWriteSchema,
});

export type SessionWrite = z.infer<typeof sessionWriteSchema>;
export type SessionWriteKind = SessionWrite['kind'];
export type PendingWrite = z.infer<typeof pendingWriteSchema>;

/** La secuencia de una entrada guardada, aunque el resto de la entrada no se pueda leer. */
export function readSequence(entry: unknown): number | null {
  if (typeof entry !== 'object' || entry === null || !('sequence' in entry)) return null;
  const { sequence } = entry;
  return typeof sequence === 'number' && Number.isSafeInteger(sequence) ? sequence : null;
}
