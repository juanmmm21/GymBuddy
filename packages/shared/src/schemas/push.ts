import { z } from 'zod';
import { isoDatetimeSchema, resourceIdSchema } from './common';

/** Una URL de servicio de push es corta (unos 200 caracteres); el tope solo corta abusos. */
export const MAX_PUSH_ENDPOINT_LENGTH = 2048;

/**
 * Clave pública P-256 sin comprimir (65 bytes) en base64url, que es como la da
 * `PushSubscription.toJSON()`. Se admite el relleno por si algún navegador lo deja. Empieza por
 * «B» porque el primer byte de un punto sin comprimir es 0x04, y el último carácter solo lleva
 * cuatro bits de dato: los dos que sobran son cero.
 */
const P256_PUBLIC_KEY_PATTERN = /^B[A-Za-z0-9_-]{85}[AEIMQUYcgkosw048]=?$/;

/** El secreto de autenticación del push: 16 bytes en base64url. */
const PUSH_AUTH_SECRET_PATTERN = /^[A-Za-z0-9_-]{21}[AQgw](==)?$/;

export const p256PublicKeySchema = z.string().regex(P256_PUBLIC_KEY_PATTERN, {
  message: 'La clave debe ser un punto P-256 sin comprimir en base64url',
});

/**
 * La suscripción de un navegador, tal cual sale de `PushSubscription.toJSON()`. Solo https: los
 * servicios de push de Apple, Google y Mozilla lo son todos, y el Worker no debe llamar a otra cosa.
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(MAX_PUSH_ENDPOINT_LENGTH),
  keys: z.object({
    p256dh: p256PublicKeySchema,
    auth: z.string().regex(PUSH_AUTH_SECRET_PATTERN, {
      message: 'El secreto debe ser de 16 bytes en base64url',
    }),
  }),
});

/** Darse de baja: el `endpoint` identifica la suscripción de ese navegador. */
export const deletePushSubscriptionRequestSchema = pushSubscriptionSchema.pick({ endpoint: true });

/**
 * La clave pública VAPID con la que el navegador se suscribe. `null` cuando el servidor no tiene
 * las claves puestas: la PWA no ofrece el aviso, porque nadie podría firmarlo.
 */
export const pushConfigSchema = z.object({
  publicKey: p256PublicKeySchema.nullable(),
});

export type PushSubscriptionRequest = z.infer<typeof pushSubscriptionSchema>;
export type DeletePushSubscriptionRequest = z.infer<typeof deletePushSubscriptionRequestSchema>;
export type PushConfig = z.infer<typeof pushConfigSchema>;

/**
 * Hasta dónde puede quedar por delante el fin de un descanso. El objetivo más largo de la PWA son
 * cinco minutos; el margen cubre un descanso alargado a mano sin dejar programar avisos para dentro
 * de horas, que sonarían cuando ya nadie está entrenando.
 */
export const MAX_REST_NOTICE_DELAY_SECONDS = 15 * 60;

/**
 * Programa el aviso de fin de descanso (ADR 0009). `endsAt` es el instante en que se cumple el
 * objetivo: lo calcula la PWA desde la última serie, que es quien conoce el objetivo del
 * dispositivo. Repetirlo con otra hora reprograma el aviso; solo hay uno por cuenta.
 */
export const restNoticeRequestSchema = z.object({
  sessionId: resourceIdSchema,
  endsAt: isoDatetimeSchema,
});

export type RestNoticeRequest = z.infer<typeof restNoticeRequestSchema>;
