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

export const sessionSchema = z.object({
  token: z.string().min(1),
  expiresAt: isoDatetimeSchema,
  user: userSchema,
});

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
export type RegistrationOptionsRequest = z.infer<typeof registrationOptionsRequestSchema>;
export type RegistrationOptionsResponse = z.infer<typeof registrationOptionsResponseSchema>;
export type RegistrationVerifyRequest = z.infer<typeof registrationVerifyRequestSchema>;
export type LoginOptionsResponse = z.infer<typeof loginOptionsResponseSchema>;
export type LoginVerifyRequest = z.infer<typeof loginVerifyRequestSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type DeviceLink = z.infer<typeof deviceLinkSchema>;
export type DeviceLinkOptionsRequest = z.infer<typeof deviceLinkOptionsRequestSchema>;
