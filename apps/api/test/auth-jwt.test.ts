import { describe, expect, it } from 'vitest';
import { issueSessionToken, verifySessionToken } from '../src/auth/jwt';

const SECRET = 'un-secreto-de-pruebas-suficientemente-largo';
const OTHER_SECRET = 'otro-secreto-distinto-del-primero';
const NOW = new Date('2026-09-08T12:00:00.000Z');
const USER_ID = '3f6c2b1a-58e6-4c65-9d0e-2b1a4c7f8d31';

describe('token de sesión', () => {
  it('va y vuelve con el identificador del usuario', async () => {
    const { token } = await issueSessionToken(USER_ID, SECRET, NOW);

    expect(await verifySessionToken(token, SECRET)).toBe(USER_ID);
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
});
