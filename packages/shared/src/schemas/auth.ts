import { z } from 'zod';
import { compactInvitationCode, INVITATION_CODE_PATTERN } from '../domain/invitation-code';
import { isoDatetimeSchema, localeSchema, resourceIdSchema } from './common';
import {
  authenticationCredentialSchema,
  loginOptionsSchema,
  registrationCredentialSchema,
  registrationOptionsSchema,
} from './passkey';
import { displayNameSchema, userSchema } from './user';

/**
 * Un código de invitación tal y como lo teclea alguien: se acepta en minúsculas, con guiones o
 * espacios y con una O por un cero, y sale ya en su forma canónica.
 */
export const invitationCodeSchema = z
  .string()
  .max(64)
  .transform(compactInvitationCode)
  .pipe(
    z.string().regex(INVITATION_CODE_PATTERN, {
      message: 'El código de invitación tiene doce letras y cifras',
    }),
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

export type Session = z.infer<typeof sessionSchema>;
export type RegistrationOptionsRequest = z.infer<typeof registrationOptionsRequestSchema>;
export type RegistrationOptionsResponse = z.infer<typeof registrationOptionsResponseSchema>;
export type RegistrationVerifyRequest = z.infer<typeof registrationVerifyRequestSchema>;
export type LoginOptionsResponse = z.infer<typeof loginOptionsResponseSchema>;
export type LoginVerifyRequest = z.infer<typeof loginVerifyRequestSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
