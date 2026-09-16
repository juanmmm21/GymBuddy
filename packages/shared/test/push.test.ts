import { describe, expect, it } from 'vitest';
import {
  deletePushSubscriptionRequestSchema,
  MAX_PUSH_ENDPOINT_LENGTH,
  pushConfigSchema,
  pushSubscriptionSchema,
  restNoticeRequestSchema,
} from '../src/schemas/push';

// Claves sintéticas generadas con `crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })`.
const P256DH =
  'BAgg4whJaw5eqQp4O_cggX1GRGJJ_CmGqE_0yFbeWs_ehP7pFjffJofcgZJrN19fua5DiZ5fgkFtH11xgw7GUm0';
const AUTH = 'LKrqIdpLO2NUv4Lq9iATtw';
const ENDPOINT = 'https://web.push.apple.com/QGuQyavXutnMH-B5fJ2yxH';

const subscription = { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } };

describe('pushSubscriptionSchema', () => {
  it('admite lo que da PushSubscription.toJSON() y descarta expirationTime', () => {
    expect(pushSubscriptionSchema.parse({ ...subscription, expirationTime: null })).toStrictEqual(
      subscription,
    );
  });

  it('admite las claves con el relleno de base64', () => {
    const padded = { endpoint: ENDPOINT, keys: { p256dh: `${P256DH}=`, auth: `${AUTH}==` } };

    expect(pushSubscriptionSchema.safeParse(padded).success).toBe(true);
  });

  it('solo acepta un endpoint https y no demasiado largo', () => {
    const plain = { ...subscription, endpoint: 'http://push.example.com/abc' };
    const tooLong = {
      ...subscription,
      endpoint: `https://push.example.com/${'a'.repeat(MAX_PUSH_ENDPOINT_LENGTH)}`,
    };

    expect(pushSubscriptionSchema.safeParse(plain).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse(tooLong).success).toBe(false);
  });

  it('rechaza claves que no son un punto P-256 ni un secreto de 16 bytes', () => {
    const compressed = { ...subscription, keys: { p256dh: `A${P256DH.slice(1)}`, auth: AUTH } };
    const shortKey = { ...subscription, keys: { p256dh: P256DH.slice(0, -1), auth: AUTH } };
    const longAuth = { ...subscription, keys: { p256dh: P256DH, auth: `${AUTH}AA` } };
    const standardBase64 = {
      ...subscription,
      keys: { p256dh: P256DH.replaceAll('_', '/'), auth: AUTH },
    };

    for (const body of [compressed, shortKey, longAuth, standardBase64]) {
      expect(pushSubscriptionSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe('deletePushSubscriptionRequestSchema', () => {
  it('solo necesita el endpoint', () => {
    expect(deletePushSubscriptionRequestSchema.parse(subscription)).toStrictEqual({
      endpoint: ENDPOINT,
    });
  });
});

describe('pushConfigSchema', () => {
  it('lleva la clave pública o null si el servidor no tiene claves', () => {
    expect(pushConfigSchema.parse({ publicKey: P256DH })).toStrictEqual({ publicKey: P256DH });
    expect(pushConfigSchema.parse({ publicKey: null })).toStrictEqual({ publicKey: null });
    expect(pushConfigSchema.safeParse({ publicKey: 'no-es-una-clave' }).success).toBe(false);
  });
});

describe('restNoticeRequestSchema', () => {
  const notice = {
    sessionId: '0d6f3b1a-7c2e-4f58-9a41-2b3c4d5e6f70',
    endsAt: '2026-09-16T18:31:30.000+02:00',
  };

  it('admite la sesión y el fin del descanso con zona horaria', () => {
    expect(restNoticeRequestSchema.parse(notice)).toStrictEqual(notice);
  });

  it('rechaza una hora sin zona y una sesión que no es un uuid', () => {
    expect(
      restNoticeRequestSchema.safeParse({ ...notice, endsAt: '2026-09-16T18:31:30' }).success,
    ).toBe(false);
    expect(restNoticeRequestSchema.safeParse({ ...notice, sessionId: 'sesion-1' }).success).toBe(
      false,
    );
  });
});
