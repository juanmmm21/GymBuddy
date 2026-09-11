import { describe, expect, it } from 'vitest';
import {
  INVITATION_CODE_ALPHABET,
  INVITATION_CODE_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  authenticationCredentialSchema,
  compactInvitationCode,
  displayNameSchema,
  formatInvitationCode,
  invitationCodeSchema,
  isInvitationCode,
  loginOptionsSchema,
  registrationCredentialSchema,
  registrationOptionsRequestSchema,
  registrationOptionsSchema,
} from '../src/index';

describe('código de invitación', () => {
  it('usa el alfabeto de Crockford, sin letras que se confundan con cifras', () => {
    expect(INVITATION_CODE_ALPHABET).toHaveLength(32);
    for (const letter of ['I', 'L', 'O', 'U']) {
      expect(INVITATION_CODE_ALPHABET).not.toContain(letter);
    }
    expect(INVITATION_CODE_LENGTH).toBe(12);
  });

  it('compacta lo tecleado: mayúsculas, sin separadores y la O, la I y la L como cifras', () => {
    expect(compactInvitationCode(' abcd-efgh jkmn ')).toBe('ABCDEFGHJKMN');
    // Guiones largos: los pone el corrector de un chat al pegar «--».
    expect(compactInvitationCode('0oil—1234–5678')).toBe('001112345678');
  });

  it('solo es código la forma canónica de doce símbolos del alfabeto', () => {
    expect(isInvitationCode('ABCDEFGHJKMN')).toBe(true);
    expect(isInvitationCode('ABCDEFGHJKM')).toBe(false);
    expect(isInvitationCode('ABCDEFGHJKMU')).toBe(false);
    expect(isInvitationCode('abcdefghjkmn')).toBe(false);
  });

  it('se enseña de cuatro en cuatro y lo enseñado vuelve a la forma canónica', () => {
    const shown = formatInvitationCode('ABCDEFGHJKMN');

    expect(shown).toBe('ABCD-EFGH-JKMN');
    expect(invitationCodeSchema.parse(shown)).toBe('ABCDEFGHJKMN');
  });

  it('el esquema devuelve la forma canónica o rechaza', () => {
    expect(invitationCodeSchema.parse('abcd efgh jkmn')).toBe('ABCDEFGHJKMN');
    expect(invitationCodeSchema.safeParse('ABCD-EFGH').success).toBe(false);
    expect(invitationCodeSchema.safeParse('ABCD-EFGH-JKMU').success).toBe(false);
    expect(invitationCodeSchema.safeParse('').success).toBe(false);
  });
});

describe('nombre visible', () => {
  it('se recorta y no puede quedarse vacío', () => {
    expect(displayNameSchema.parse('  Juan  ')).toBe('Juan');
    expect(displayNameSchema.safeParse('   ').success).toBe(false);
  });

  it('tiene tope', () => {
    expect(displayNameSchema.safeParse('a'.repeat(MAX_DISPLAY_NAME_LENGTH)).success).toBe(true);
    expect(displayNameSchema.safeParse('a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1)).success).toBe(
      false,
    );
  });
});

describe('primer paso del registro', () => {
  it('normaliza el código y el nombre', () => {
    const parsed = registrationOptionsRequestSchema.parse({
      invitationCode: 'abcd-efgh-jkmn',
      displayName: ' Juan ',
      locale: 'es',
    });

    expect(parsed).toEqual({ invitationCode: 'ABCDEFGHJKMN', displayName: 'Juan', locale: 'es' });
  });

  it('rechaza un idioma que la app no tiene', () => {
    const parsed = registrationOptionsRequestSchema.safeParse({
      invitationCode: 'ABCDEFGHJKMN',
      displayName: 'Juan',
      locale: 'fr',
    });

    expect(parsed.success).toBe(false);
  });
});

describe('formas de WebAuthn', () => {
  const registrationOptions = {
    challenge: 'q7s9fW2l0sTg1mD8Yb3cXw',
    rp: { name: 'GymBuddy', id: 'localhost' },
    user: { id: 'NGQyYTZkOWM', name: 'Juan', displayName: 'Juan' },
    pubKeyCredParams: [
      { alg: -8, type: 'public-key' },
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' },
    ],
    timeout: 120_000,
    attestation: 'none',
    excludeCredentials: [],
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    },
    extensions: { credProps: true },
    hints: [],
  };

  const loginOptions = {
    challenge: 'q7s9fW2l0sTg1mD8Yb3cXw',
    rpId: 'localhost',
    timeout: 120_000,
    userVerification: 'required',
    allowCredentials: [],
  };

  const registrationCredential = {
    id: 'AQIDBAUGBwg',
    rawId: 'AQIDBAUGBwg',
    type: 'public-key',
    authenticatorAttachment: 'platform',
    clientExtensionResults: { credProps: { rk: true } },
    response: {
      clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIn0',
      attestationObject: 'o2NmbXRkbm9uZWdhdHRTdG10oA',
      transports: ['internal', 'hybrid'],
    },
  };

  it('acepta las opciones de registro que emite el Worker', () => {
    expect(registrationOptionsSchema.safeParse(registrationOptions).success).toBe(true);
  });

  it('rechaza unas opciones de registro que relajan la verificación del usuario', () => {
    const relaxed = {
      ...registrationOptions,
      authenticatorSelection: {
        ...registrationOptions.authenticatorSelection,
        userVerification: 'preferred',
      },
    };

    expect(registrationOptionsSchema.safeParse(relaxed).success).toBe(false);
  });

  it('rechaza unas opciones de entrada que no exigen verificación', () => {
    expect(loginOptionsSchema.safeParse(loginOptions).success).toBe(true);
    expect(
      loginOptionsSchema.safeParse({ ...loginOptions, userVerification: 'preferred' }).success,
    ).toBe(false);
  });

  it('acepta la respuesta de un navegador y descarta las extensiones que no conoce', () => {
    const parsed = registrationCredentialSchema.parse({
      ...registrationCredential,
      clientExtensionResults: { credProps: { rk: true }, prf: { enabled: false } },
    });

    expect(parsed.clientExtensionResults).toEqual({ credProps: { rk: true } });
  });

  it('rechaza binarios que no van en base64url', () => {
    const padded = {
      ...registrationCredential,
      response: { ...registrationCredential.response, attestationObject: 'o2Nm+bXRk/bm9uZQ==' },
    };

    expect(registrationCredentialSchema.safeParse(padded).success).toBe(false);
  });

  it('acepta una entrada con el identificador de usuario vacío', () => {
    const parsed = authenticationCredentialSchema.safeParse({
      id: 'AQIDBAUGBwg',
      rawId: 'AQIDBAUGBwg',
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0',
        authenticatorData: 'SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAQ',
        signature: 'MEUCIQDTGOxqmWe',
        userHandle: '',
      },
    });

    expect(parsed.success).toBe(true);
  });
});
