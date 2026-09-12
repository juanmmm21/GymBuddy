import { sign } from 'hono/jwt';
import { describe, expect, it } from 'vitest';
import {
  SESSION_TTL_SECONDS,
  issueSessionToken,
  shouldRenewSession,
  verifySessionToken,
} from '../src/auth/jwt';

const SECRET = 'un-secreto-de-pruebas-suficientemente-largo';
const OTHER_SECRET = 'otro-secreto-distinto-del-primero';
const NOW = new Date('2026-09-08T12:00:00.000Z');
const USER_ID = '3f6c2b1a-58e6-4c65-9d0e-2b1a4c7f8d31';

describe('token de sesión', () => {
  it('va y vuelve con el identificador del usuario y su caducidad', async () => {
    const { token } = await issueSessionToken(USER_ID, SECRET, NOW);

    expect(await verifySessionToken(token, SECRET)).toEqual({
      userId: USER_ID,
      expiresAtSeconds: Math.floor(NOW.getTime() / 1000) + SESSION_TTL_SECONDS,
    });
  });

  it('caduca a los treinta días', async () => {
    const { expiresAt } = await issueSessionToken(USER_ID, SECRET, NOW);

    expect(expiresAt).toBe(new Date('2026-10-08T12:00:00.000Z').toISOString());
  });

  it('no lo acepta quien no tiene la misma clave', async () => {
    const { token } = await issueSessionToken(USER_ID, SECRET, NOW);

    expect(await verifySessionToken(token, OTHER_SECRET)).toBeNull();
  });

  it('rechaza un token ya caducado', async () => {
    const expired = await issueSessionToken(USER_ID, SECRET, new Date('2026-01-01T00:00:00.000Z'));

    expect(await verifySessionToken(expired.token, SECRET)).toBeNull();
  });

  it('rechaza un token con la carga manipulada', async () => {
    const { token } = await issueSessionToken(USER_ID, SECRET, NOW);
    const [header, , signature] = token.split('.');
    const forgedPayload = btoa(JSON.stringify({ sub: 'otro-usuario', exp: 4_102_444_800 }))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');

    expect(
      await verifySessionToken(`${String(header)}.${forgedPayload}.${String(signature)}`, SECRET),
    ).toBeNull();
  });

  it('rechaza un token sin firma, que es el ataque de algoritmo "none"', async () => {
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
    const payload = btoa(JSON.stringify({ sub: USER_ID, exp: 4_102_444_800 }))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');

    expect(await verifySessionToken(`${header}.${payload}.`, SECRET)).toBeNull();
  });

  it('rechaza una cadena que ni siquiera es un token', async () => {
    for (const token of ['', 'nope', 'a.b', 'a.b.c.d']) {
      expect(await verifySessionToken(token, SECRET)).toBeNull();
    }
  });

  it('rechaza un token nuestro sin caducidad: no lo hemos emitido nosotros', async () => {
    const eternal = await sign({ sub: USER_ID }, SECRET, 'HS256');

    expect(await verifySessionToken(eternal, SECRET)).toBeNull();
  });
});

describe('renovar la sesión al usarse', () => {
  const sessionIssuedAt = (issuedAt: Date) => ({
    userId: USER_ID,
    expiresAtSeconds: Math.floor(issuedAt.getTime() / 1000) + SESSION_TTL_SECONDS,
  });

  const daysAfter = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);

  it('no toca un token recién emitido', () => {
    expect(shouldRenewSession(sessionIssuedAt(NOW), NOW)).toBe(false);
  });

  it('aguanta hasta que le queda la mitad de vida', () => {
    expect(shouldRenewSession(sessionIssuedAt(NOW), daysAfter(14))).toBe(false);
    expect(shouldRenewSession(sessionIssuedAt(NOW), daysAfter(15.5))).toBe(true);
  });

  it('renueva el de quien vuelve tras tres semanas', () => {
    expect(shouldRenewSession(sessionIssuedAt(NOW), daysAfter(21))).toBe(true);
  });
});
