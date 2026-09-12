import { z } from 'zod';
import {
  compactAccessCode,
  DEVICE_LINK_CODE_LENGTH,
  DEVICE_LINK_CODE_PATTERN,
  INVITATION_CODE_LENGTH,
  INVITATION_CODE_PATTERN,
} from '../domain/access-code';
import { isoDatetimeSchema, localeSchema, resourceIdSchema } from './common';
import {
  authenticationCredentialSchema,
  loginOptionsSchema,
  registrationCredentialSchema,
  registrationOptionsSchema,
} from './passkey';
import { displayNameSchema, userSchema } from './user';

/**
 * Un código tal y como lo teclea alguien: se acepta en minúsculas, con guiones o espacios y con
 * una O por un cero, y sale ya en su forma canónica.
 */
function accessCodeSchema(pattern: RegExp, message: string) {
  return z
    .string()
    .max(64)
    .transform(compactAccessCode)
    .pipe(z.string().regex(pattern, { message }));
}

export const invitationCodeSchema = accessCodeSchema(
  INVITATION_CODE_PATTERN,
  `El código de invitación tiene ${String(INVITATION_CODE_LENGTH)} letras y cifras`,
);

/** El de «añadir otro dispositivo», que se teclea a mano y por eso es más corto. */
export const deviceLinkCodeSchema = accessCodeSchema(
  DEVICE_LINK_CODE_PATTERN,
  `El código tiene ${String(DEVICE_LINK_CODE_LENGTH)} letras y cifras`,
);

/**
 * Una sesión renovada: el mismo usuario con un token nuevo. Viaja en las cabeceras de cualquier
 * respuesta autenticada, así que aquí no va el usuario — quien recibe esto ya sabe quién es.
 */
export const sessionRefreshSchema = z.object({
  token: z.string().min(1),
  expiresAt: isoDatetimeSchema,
});

export const sessionSchema = sessionRefreshSchema.extend({
  user: userSchema,
});

/**
 * Cabeceras con las que una respuesta entrega una sesión renovada. Van en dos porque el valor
 * es un par de cadenas y meter un JSON en una cabecera obligaría a escaparlo para nada.
 *
 * Ojo al desplegar (Fase 14): con la PWA y el Worker en orígenes distintos, el navegador no deja
 * leer una cabecera de respuesta que no esté en `Access-Control-Expose-Headers`.
 */
export const SESSION_REFRESH_TOKEN_HEADER = 'x-gymbuddy-session-token';
export const SESSION_REFRESH_EXPIRES_HEADER = 'x-gymbuddy-session-expires-at';

/** Lo mínimo que hace falta de unas cabeceras: `Headers` del navegador y del Worker lo cumplen. */
export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * La sesión renovada que trae una respuesta, o `null` si no trae ninguna. Pasa por el esquema
 * como cualquier otra respuesta: unas cabeceras a medias o con una fecha inventada no se guardan.
 */
export function readSessionRefresh(headers: HeaderReader): SessionRefresh | null {
  const token = headers.get(SESSION_REFRESH_TOKEN_HEADER);
  const expiresAt = headers.get(SESSION_REFRESH_EXPIRES_HEADER);
  if (token === null || expiresAt === null) return null;

  const parsed = sessionRefreshSchema.safeParse({ token, expiresAt });

  return parsed.success ? parsed.data : null;
}

/** Primer paso del registro: con qué invitación, con qué nombre y en qué idioma. */
export const registrationOptionsRequestSchema = z.object({
  invitationCode: invitationCodeSchema,
  displayName: displayNameSchema,
  locale: localeSchema,
});

/**
 * Las opciones van con el identificador del reto que el Worker guardó. Viaja aparte de las
 * opciones porque la verificación lo necesita para encontrar el reto antes de mirar la firma.
 */
export const registrationOptionsResponseSchema = z.object({
  challengeId: resourceIdSchema,
  options: registrationOptionsSchema,
});

export const registrationVerifyRequestSchema = z.object({
  challengeId: resourceIdSchema,
  credential: registrationCredentialSchema,
});

export const loginOptionsResponseSchema = z.object({
  challengeId: resourceIdSchema,
  options: loginOptionsSchema,
});

export const loginVerifyRequestSchema = z.object({
  challengeId: resourceIdSchema,
  credential: authenticationCredentialSchema,
});

/** Una invitación recién creada. Es la única vez que el código viaja en claro. */
export const invitationSchema = z.object({
  code: z.string().regex(INVITATION_CODE_PATTERN),
  expiresAt: isoDatetimeSchema,
});

/**
 * Una invitación que alguien generó y todavía no ha usado nadie. Sin el código: solo existe en
 * claro en la respuesta que lo crea, así que lo único que se puede contar después es cuántas
 * hay vivas y hasta cuándo.
 */
export const pendingInvitationSchema = z.object({
  createdAt: isoDatetimeSchema,
  expiresAt: isoDatetimeSchema,
});

/**
 * Cuántas invitaciones sin usar tiene quien pregunta y cuántas más puede generar. El tope lo
 * fija el Worker y viaja en la respuesta: la PWA lo enseña, no lo decide.
 */
export const invitationStatusSchema = z.object({
  limit: z.int().positive(),
  remaining: z.int().nonnegative(),
  pending: z.array(pendingInvitationSchema),
});

/**
 * El código con el que un dispositivo nuevo se suma a una cuenta que ya existe. Se pide desde un
 * dispositivo que ya tiene sesión y se teclea en el otro; como la invitación, en la base solo
 * queda su digest, así que esta respuesta es la única vez que existe en claro.
 */
export const deviceLinkSchema = z.object({
  code: z.string().regex(DEVICE_LINK_CODE_PATTERN),
  expiresAt: isoDatetimeSchema,
});

/**
 * Primer paso de «añadir otro dispositivo», desde el dispositivo nuevo: solo el código. Quién es
 * la cuenta lo dice el código, no quien lo teclea, y la ceremonia que sigue es la del registro
 * (`registrationOptionsResponseSchema` y `registrationVerifyRequestSchema`), porque lo que se
 * crea es otra passkey.
 */
export const deviceLinkOptionsRequestSchema = z.object({
  linkCode: deviceLinkCodeSchema,
});

export type Session = z.infer<typeof sessionSchema>;
export type SessionRefresh = z.infer<typeof sessionRefreshSchema>;
export type RegistrationOptionsRequest = z.infer<typeof registrationOptionsRequestSchema>;
export type RegistrationOptionsResponse = z.infer<typeof registrationOptionsResponseSchema>;
export type RegistrationVerifyRequest = z.infer<typeof registrationVerifyRequestSchema>;
export type LoginOptionsResponse = z.infer<typeof loginOptionsResponseSchema>;
export type LoginVerifyRequest = z.infer<typeof loginVerifyRequestSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type PendingInvitation = z.infer<typeof pendingInvitationSchema>;
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;
export type DeviceLink = z.infer<typeof deviceLinkSchema>;
export type DeviceLinkOptionsRequest = z.infer<typeof deviceLinkOptionsRequestSchema>;
