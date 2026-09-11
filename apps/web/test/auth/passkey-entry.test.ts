import { describe, expect, it } from 'vitest';
import { ApiContractError, ApiRequestError, ApiTransportError } from '../../src/api/client';
import { PasskeyCeremonyError, toCeremonyError } from '../../src/auth/passkey-authenticator';
import { entryFailureOf } from '../../src/auth/use-passkey-entry';
import { localeFromLanguage } from '../../src/lib/locale';

const browserError = (name: string): Error => new DOMException('del navegador', name);

describe('toCeremonyError', () => {
  it('cancelar, agotar el tiempo o no tener llave es «cancelado»', () => {
    expect(toCeremonyError(browserError('NotAllowedError')).reason).toBe('cancelled');
    expect(toCeremonyError(browserError('AbortError')).reason).toBe('cancelled');
  });

  it('un navegador sin la función es «no compatible»', () => {
    expect(toCeremonyError(browserError('NotSupportedError')).reason).toBe('unsupported');
  });

  it('el resto es un fallo, y conserva la causa para el log', () => {
    const original = browserError('SecurityError');
    const translated = toCeremonyError(original);

    expect(translated.reason).toBe('failed');
    expect(translated.cause).toBe(original);
  });

  it('no vuelve a envolver lo que ya está traducido', () => {
    const already = new PasskeyCeremonyError('cancelled', 'ya traducido');

    expect(toCeremonyError(already)).toBe(already);
  });
});

describe('entryFailureOf', () => {
  it('explica los dos rechazos del Worker por su código', () => {
    expect(entryFailureOf(new ApiRequestError('invitation_invalid', 400, 'no'))).toBe(
      'invitation_invalid',
    );
    expect(entryFailureOf(new ApiRequestError('passkey_invalid', 400, 'no'))).toBe(
      'passkey_invalid',
    );
  });

  it('distingue sin red, cancelado y no compatible', () => {
    expect(entryFailureOf(new ApiTransportError('sin red'))).toBe('offline');
    expect(entryFailureOf(new PasskeyCeremonyError('cancelled', 'x'))).toBe('cancelled');
    expect(entryFailureOf(new PasskeyCeremonyError('unsupported', 'x'))).toBe('unsupported');
  });

  it('lo demás es inesperado', () => {
    expect(entryFailureOf(new PasskeyCeremonyError('failed', 'x'))).toBe('unexpected');
    expect(entryFailureOf(new ApiRequestError('internal_error', 500, 'x'))).toBe('unexpected');
    expect(entryFailureOf(new ApiContractError('x', 200))).toBe('unexpected');
  });
});

describe('localeFromLanguage', () => {
  it('arranca en español con cualquier variante de español, y si no en inglés', () => {
    expect(localeFromLanguage('es')).toBe('es');
    expect(localeFromLanguage('es-419')).toBe('es');
    expect(localeFromLanguage('ES-es')).toBe('es');
    expect(localeFromLanguage('en-US')).toBe('en');
    expect(localeFromLanguage('pt-BR')).toBe('en');
    expect(localeFromLanguage(undefined)).toBe('en');
  });
});
