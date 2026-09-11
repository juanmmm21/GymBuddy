import { z } from 'zod';

/*
 * Las formas JSON de WebAuthn que cruzan entre el Worker y la PWA. Los binarios viajan en
 * base64url sin relleno, que es lo que define la especificación para estas formas.
 *
 * Los campos opcionales usan `exactOptional` y no `optional`: con `exactOptionalPropertyTypes`
 * activo, un `campo?: T | undefined` no encaja en los tipos de `@simplewebauthn`, que declaran
 * `campo?: T`, y la PWA y el Worker tienen que pasar estas formas a esa librería tal cual.
 */

const base64Url = (maxLength: number) =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .regex(/^[A-Za-z0-9_-]+$/, { message: 'Debe ir en base64url sin relleno' });

/** WebAuthn permite identificadores de hasta 1023 bytes: 1364 caracteres en base64url. */
export const credentialIdSchema = base64Url(1364);

const challengeSchema = base64Url(128);

const transportsSchema = z.array(z.string().min(1).max(32)).max(8);

const credentialDescriptorSchema = z.object({
  id: credentialIdSchema,
  type: z.literal('public-key'),
  transports: transportsSchema.exactOptional(),
});

/**
 * Las opciones para crear una passkey. Las arma el Worker y la PWA se las pasa al navegador sin
 * tocarlas. Los valores fijos van como literales porque son la política de seguridad y no un
 * detalle: una respuesta que pidiera `userVerification: "preferred"` no cumple el contrato.
 */
export const registrationOptionsSchema = z.object({
  challenge: challengeSchema,
  rp: z.object({ name: z.string().min(1), id: z.string().min(1) }),
  user: z.object({
    // El identificador del usuario en bytes; es lo que el móvil devuelve al entrar.
    id: base64Url(128),
    name: z.string().min(1),
    displayName: z.string().min(1),
  }),
  pubKeyCredParams: z.array(z.object({ alg: z.int(), type: z.literal('public-key') })).min(1),
  timeout: z.int().positive(),
  attestation: z.literal('none'),
  excludeCredentials: z.array(credentialDescriptorSchema),
  authenticatorSelection: z.object({
    // Detectable: la entrada no pide nombre de usuario, el móvil ofrece la llave que tenga.
    residentKey: z.literal('required'),
    requireResidentKey: z.literal(true),
    // La passkey es el único factor: la huella, la cara o el PIN del móvil son obligatorios.
    userVerification: z.literal('required'),
  }),
  extensions: z.object({ credProps: z.literal(true) }),
  hints: z.array(z.enum(['client-device', 'hybrid', 'security-key'])),
});

/** Las opciones para entrar. Sin `allowCredentials`: vale cualquier llave de GymBuddy del móvil. */
export const loginOptionsSchema = z.object({
  challenge: challengeSchema,
  rpId: z.string().min(1),
  timeout: z.int().positive(),
  userVerification: z.literal('required'),
  allowCredentials: z.array(credentialDescriptorSchema),
});

const clientExtensionResultsSchema = z.object({
  appid: z.boolean().exactOptional(),
  credProps: z.object({ rk: z.boolean().exactOptional() }).exactOptional(),
  hmacCreateSecret: z.boolean().exactOptional(),
});

const authenticatorAttachmentSchema = z.enum(['platform', 'cross-platform']);

/** Lo que devuelve el navegador al crear la passkey (`RegistrationResponseJSON`). */
export const registrationCredentialSchema = z.object({
  id: credentialIdSchema,
  rawId: credentialIdSchema,
  type: z.literal('public-key'),
  authenticatorAttachment: authenticatorAttachmentSchema.exactOptional(),
  clientExtensionResults: clientExtensionResultsSchema,
  response: z.object({
    clientDataJSON: base64Url(8192),
    attestationObject: base64Url(65_536),
    authenticatorData: base64Url(32_768).exactOptional(),
    transports: transportsSchema.exactOptional(),
    publicKeyAlgorithm: z.int().exactOptional(),
    publicKey: base64Url(8192).exactOptional(),
  }),
});

/** Lo que devuelve el navegador al usar la passkey (`AuthenticationResponseJSON`). */
export const authenticationCredentialSchema = z.object({
  id: credentialIdSchema,
  rawId: credentialIdSchema,
  type: z.literal('public-key'),
  authenticatorAttachment: authenticatorAttachmentSchema.exactOptional(),
  clientExtensionResults: clientExtensionResultsSchema,
  response: z.object({
    clientDataJSON: base64Url(8192),
    authenticatorData: base64Url(32_768),
    signature: base64Url(2048),
    // Puede llegar vacío: algunos navegadores devuelven un búfer de cero bytes en vez de nada.
    userHandle: z
      .string()
      .max(128)
      .regex(/^[A-Za-z0-9_-]*$/)
      .exactOptional(),
  }),
});

export type RegistrationOptions = z.infer<typeof registrationOptionsSchema>;
export type LoginOptions = z.infer<typeof loginOptionsSchema>;
export type RegistrationCredential = z.infer<typeof registrationCredentialSchema>;
export type AuthenticationCredential = z.infer<typeof authenticationCredentialSchema>;
