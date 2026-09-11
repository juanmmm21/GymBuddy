import {
  loginOptionsResponseSchema,
  registrationOptionsResponseSchema,
  type LoginOptionsResponse,
  type LoginVerifyRequest,
  type RegistrationOptionsRequest,
  type RegistrationOptionsResponse,
  type RegistrationVerifyRequest,
} from '@gymbuddy/shared';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  invitation,
  passkeyCredential,
  user,
  type PasskeyCredentialRow,
  type UserRow,
} from '../db/schema';
import { ApiException } from '../http/errors';
import {
  storeChallenge,
  takeAuthenticationChallenge,
  takeRegistrationChallenge,
} from './challenges';
import {
  consumeInvitation,
  hashInvitationCode,
  isInvitationUsable,
  releaseInvitation,
} from './invitations';
import type { RelyingParty } from './relying-party';
import { findUserById } from './users';

/** EdDSA, ES256 y RS256: lo que generan los móviles, Windows Hello y las llaves físicas. */
const SUPPORTED_ALGORITHM_IDS = [-8, -7, -257];

/** Lo que el navegador espera a la huella o la cara antes de rendirse. */
export const CEREMONY_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Primer paso del registro. La invitación se comprueba aquí pero no se gasta: eso pasa cuando
 * la passkey ya está verificada, para que un registro cancelado a mitad no la consuma.
 */
export async function startPasskeyRegistration(
  db: Database,
  rp: RelyingParty,
  request: RegistrationOptionsRequest,
  now: Date,
): Promise<RegistrationOptionsResponse> {
  const invitationHash = await hashInvitationCode(request.invitationCode);
  if (!(await isInvitationUsable(db, invitationHash, now))) throw invitationInvalid();

  const userId = crypto.randomUUID();
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    // Es lo que el móvil enseña al elegir la llave: el nombre de la persona.
    userName: request.displayName,
    userDisplayName: request.displayName,
    // Lo que el móvil devuelve al entrar (`userHandle`): los bytes del id de la cuenta.
    userID: isoUint8Array.fromUTF8String(userId),
    timeout: CEREMONY_TIMEOUT_MS,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    supportedAlgorithmIDs: SUPPORTED_ALGORITHM_IDS,
  });

  const challengeId = await storeChallenge(
    db,
    {
      kind: 'registration',
      challenge: options.challenge,
      registration: {
        userId,
        displayName: request.displayName,
        locale: request.locale,
        invitationHash,
      },
    },
    now,
  );

  // Se valida lo que sale: si una versión nueva de la librería cambia la forma de las opciones,
  // se nota aquí y no en el navegador de alguien.
  return registrationOptionsResponseSchema.parse({ challengeId, options });
}

/** Segundo paso del registro: verifica la passkey, gasta la invitación y crea la cuenta. */
export async function finishPasskeyRegistration(
  db: Database,
  rp: RelyingParty,
  request: RegistrationVerifyRequest,
  now: Date,
): Promise<UserRow> {
  const pending = await takeRegistrationChallenge(db, request.challengeId, now);
  if (pending === null) {
    throw passkeyInvalid('El registro ha caducado o ya se usó: empieza de nuevo');
  }

  const verification = await attemptVerification('registro', () =>
    verifyRegistrationResponse({
      response: request.credential,
      expectedChallenge: pending.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserPresence: true,
      requireUserVerification: true,
      supportedAlgorithmIDs: SUPPORTED_ALGORITHM_IDS,
    }),
  );
  if (verification === null || !verification.verified) {
    throw passkeyInvalid('No se pudo comprobar la passkey');
  }

  const { credential, credentialBackedUp } = verification.registrationInfo;
  if ((await findPasskeyCredential(db, credential.id)) !== null) {
    // Un identificador ya registrado no es una llave nueva: sería colgar de otra cuenta una
    // credencial que ya es de alguien.
    throw passkeyInvalid('Esa passkey ya está registrada');
  }

  const { registration } = pending;
  if (!(await consumeInvitation(db, registration.invitationHash, now))) throw invitationInvalid();

  const createdAt = now.toISOString();
  const account: UserRow = {
    id: registration.userId,
    displayName: registration.displayName,
    locale: registration.locale,
    unitSystem: 'metric',
    createdAt,
  };

  try {
    // Un `batch` de D1 es una transacción: o entran la cuenta y su passkey, o ninguna.
    await db.batch([
      db.insert(user).values(account),
      db.insert(passkeyCredential).values({
        id: credential.id,
        userId: account.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? null,
        backedUp: credentialBackedUp,
        createdAt,
        lastUsedAt: null,
      }),
      db
        .update(invitation)
        .set({ usedByUserId: account.id })
        .where(eq(invitation.codeHash, registration.invitationHash)),
    ]);
  } catch (error) {
    // Sin cuenta creada la invitación no puede quedarse gastada: se devuelve, y el fallo sigue
    // su camino hasta el manejador central como el 500 que es.
    try {
      await releaseInvitation(db, registration.invitationHash, createdAt);
    } catch (releaseError) {
      console.error('No se pudo devolver la invitación de un registro fallido', releaseError);
    }
    throw error;
  }

  return account;
}

/** Primer paso de la entrada. Público por fuerza: quien lo pide todavía no tiene sesión. */
export async function startPasskeyLogin(
  db: Database,
  rp: RelyingParty,
  now: Date,
): Promise<LoginOptionsResponse> {
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    // Vacía a propósito: la entrada no pide usuario y el móvil ofrece la llave que tenga.
    allowCredentials: [],
    timeout: CEREMONY_TIMEOUT_MS,
    userVerification: 'required',
  });

  const challengeId = await storeChallenge(
    db,
    { kind: 'authentication', challenge: options.challenge },
    now,
  );

  return loginOptionsResponseSchema.parse({ challengeId, options });
}

/** Segundo paso de la entrada: verifica la firma y devuelve la cuenta de esa passkey. */
export async function finishPasskeyLogin(
  db: Database,
  rp: RelyingParty,
  request: LoginVerifyRequest,
  now: Date,
): Promise<UserRow> {
  const challenge = await takeAuthenticationChallenge(db, request.challengeId, now);
  if (challenge === null) {
    throw passkeyInvalid('La entrada ha caducado o ya se usó: vuelve a intentarlo');
  }

  const stored = await findPasskeyCredential(db, request.credential.id);
  if (stored === null) throw passkeyInvalid('Esa passkey no es de ninguna cuenta');

  // El móvil devuelve la cuenta con la que creó la llave. Si no es la de la credencial guardada,
  // alguien está presentando la credencial de otro.
  const { userHandle } = request.credential.response;
  if (
    userHandle !== undefined &&
    userHandle !== '' &&
    userHandle !== isoBase64URL.fromUTF8String(stored.userId)
  ) {
    throw passkeyInvalid('Esa passkey no es de esta cuenta');
  }

  const verification = await attemptVerification('entrada', () =>
    verifyAuthenticationResponse({
      response: request.credential,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: {
        id: stored.id,
        publicKey: isoBase64URL.toBuffer(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports ?? [],
      },
      requireUserVerification: true,
    }),
  );
  if (verification === null || !verification.verified) {
    throw passkeyInvalid('No se pudo comprobar la passkey');
  }

  const { newCounter, credentialBackedUp } = verification.authenticationInfo;
  await db
    .update(passkeyCredential)
    .set({ counter: newCounter, backedUp: credentialBackedUp, lastUsedAt: now.toISOString() })
    .where(eq(passkeyCredential.id, stored.id));

  const account = await findUserById(db, stored.userId);
  // La clave ajena es `on delete cascade`: una passkey sin cuenta no debería existir.
  if (account === null) throw passkeyInvalid('Esa passkey no es de ninguna cuenta');

  return account;
}

export async function findPasskeyCredential(
  db: Database,
  id: string,
): Promise<PasskeyCredentialRow | null> {
  const [row] = await db
    .select()
    .from(passkeyCredential)
    .where(eq(passkeyCredential.id, id))
    .limit(1);

  return row ?? null;
}

/**
 * La librería lanza una excepción por cada comprobación que no pasa (reto, origen, firma,
 * contador…). Para quien intenta entrar todas significan lo mismo, así que se registra el
 * motivo —es lo único que dirá por qué alguien no puede entrar— y se responde `passkey_invalid`.
 */
async function attemptVerification<T>(
  ceremony: 'registro' | 'entrada',
  verify: () => Promise<T>,
): Promise<T | null> {
  try {
    return await verify();
  } catch (error) {
    console.warn(`Passkey: ${ceremony} rechazado`, error);
    return null;
  }
}

function passkeyInvalid(message: string): ApiException {
  return new ApiException('passkey_invalid', message);
}

function invitationInvalid(): ApiException {
  return new ApiException(
    'invitation_invalid',
    'El código de invitación no sirve: no existe, ya se usó o ha caducado',
  );
}
