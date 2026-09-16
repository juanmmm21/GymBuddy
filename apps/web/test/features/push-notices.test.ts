import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiTransportError } from '../../src/api/client';
import {
  decodeBase64Url,
  disablePushNotices,
  enablePushNotices,
  pushAvailability,
  readPushNoticesEnabled,
} from '../../src/features/settings/push-notices';
import { createFakeFetch, errorResponse, type FakeFetch } from '../fake-fetch';
import {
  createFakePushBrowser,
  ROTATED_VAPID_PUBLIC_KEY,
  VAPID_PUBLIC_KEY,
} from '../push-fixtures';

function clientFor(fake: FakeFetch): ApiClient {
  return new ApiClient({ baseUrl: '', getToken: () => 'jwt-de-prueba', fetchImpl: fake.fetch });
}

const noContent = (): Response => new Response(null, { status: 204 });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pushAvailability', () => {
  it('un iPhone sin instalar tiene que instalar antes, tenga o no push el navegador', () => {
    expect(pushAvailability({ platform: 'ios', installed: false, browser: null })).toBe(
      'needs_install',
    );
    expect(
      pushAvailability({ platform: 'ios', installed: false, browser: createFakePushBrowser() }),
    ).toBe('needs_install');
  });

  it('sin push en el navegador no hay aviso; con permiso negado, está bloqueado', () => {
    expect(pushAvailability({ platform: 'android', installed: false, browser: null })).toBe(
      'unsupported',
    );
    expect(
      pushAvailability({
        platform: 'ios',
        installed: true,
        browser: createFakePushBrowser({ permission: 'denied' }),
      }),
    ).toBe('blocked');
  });

  it('instalada en iOS, o en Android y escritorio, se puede encender', () => {
    const browser = createFakePushBrowser();

    expect(pushAvailability({ platform: 'ios', installed: true, browser })).toBe('available');
    expect(pushAvailability({ platform: 'android', installed: false, browser })).toBe('available');
    expect(pushAvailability({ platform: 'desktop', installed: false, browser })).toBe('available');
  });
});

describe('decodeBase64Url', () => {
  it('da los 65 bytes de una clave P-256 sin comprimir', () => {
    const bytes = decodeBase64Url(VAPID_PUBLIC_KEY);

    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });

  it('admite relleno y rechaza lo que no es base64url', () => {
    expect(Array.from(decodeBase64Url('_-8='))).toStrictEqual([255, 239]);
    expect(() => decodeBase64Url('no/es+base64url')).toThrow();
  });
});

describe('readPushNoticesEnabled', () => {
  it('solo con permiso y con suscripción', async () => {
    expect(await readPushNoticesEnabled(createFakePushBrowser())).toBe(false);
    expect(
      await readPushNoticesEnabled(createFakePushBrowser({ subscribedWith: VAPID_PUBLIC_KEY })),
    ).toBe(false);
    expect(
      await readPushNoticesEnabled(
        createFakePushBrowser({ permission: 'granted', subscribedWith: VAPID_PUBLIC_KEY }),
      ),
    ).toBe(true);
  });
});

describe('enablePushNotices', () => {
  it('suscribe con la clave del servidor y le manda la suscripción al Worker', async () => {
    const fake = createFakeFetch();
    fake.on('PUT', '/push/subscription', noContent);
    const browser = createFakePushBrowser();

    const outcome = await enablePushNotices(
      browser,
      clientFor(fake),
      VAPID_PUBLIC_KEY,
      browser.requestPermission(),
    );

    expect(outcome).toBe('enabled');
    const subscription = browser.current();
    expect(new Uint8Array(subscription?.applicationServerKey ?? new ArrayBuffer(0))).toStrictEqual(
      decodeBase64Url(VAPID_PUBLIC_KEY),
    );
    const [request] = fake.requests;
    expect(request?.method).toBe('PUT');
    // Sin `expirationTime`: al Worker va la forma del contrato, no lo que dio el navegador.
    expect(request?.body).toStrictEqual({
      endpoint: subscription?.endpoint,
      keys: { p256dh: VAPID_PUBLIC_KEY, auth: 'LKrqIdpLO2NUv4Lq9iATtw' },
    });
  });

  it('sin permiso no suscribe ni llama al Worker', async () => {
    const fake = createFakeFetch();
    const browser = createFakePushBrowser({ answer: 'denied' });

    const outcome = await enablePushNotices(
      browser,
      clientFor(fake),
      VAPID_PUBLIC_KEY,
      browser.requestPermission(),
    );

    expect(outcome).toBe('not_granted');
    expect(browser.subscribeCalls()).toBe(0);
    expect(fake.requests).toHaveLength(0);
  });

  it('reutiliza la suscripción con la misma clave y la vuelve a guardar', async () => {
    const fake = createFakeFetch();
    fake.on('PUT', '/push/subscription', noContent);
    const browser = createFakePushBrowser({ subscribedWith: VAPID_PUBLIC_KEY });
    const before = browser.current();

    await enablePushNotices(browser, clientFor(fake), VAPID_PUBLIC_KEY, Promise.resolve('granted'));

    expect(browser.subscribeCalls()).toBe(0);
    expect(browser.current()).toBe(before);
    expect(fake.requests).toHaveLength(1);
  });

  it('con otra clave (rotada en el servidor) retira la vieja y suscribe de nuevo', async () => {
    const fake = createFakeFetch();
    fake.on('PUT', '/push/subscription', noContent);
    const browser = createFakePushBrowser({ subscribedWith: ROTATED_VAPID_PUBLIC_KEY });
    const before = browser.current();

    await enablePushNotices(browser, clientFor(fake), VAPID_PUBLIC_KEY, Promise.resolve('granted'));

    expect(browser.unsubscribeCalls()).toBe(1);
    expect(browser.subscribeCalls()).toBe(1);
    expect(browser.current()).not.toBe(before);
  });

  it('si el Worker no la guarda, retira la recién creada y relanza el fallo', async () => {
    const fake = createFakeFetch();
    fake.on('PUT', '/push/subscription', () => {
      throw new TypeError('Failed to fetch');
    });
    const browser = createFakePushBrowser();

    await expect(
      enablePushNotices(browser, clientFor(fake), VAPID_PUBLIC_KEY, Promise.resolve('granted')),
    ).rejects.toBeInstanceOf(ApiTransportError);

    expect(browser.current()).toBeNull();
  });

  it('si el Worker no la guarda, una que ya estaba se queda', async () => {
    const fake = createFakeFetch();
    fake.on('PUT', '/push/subscription', () => errorResponse('internal_error', 500, 'Fallo'));
    const browser = createFakePushBrowser({ subscribedWith: VAPID_PUBLIC_KEY });

    await expect(
      enablePushNotices(browser, clientFor(fake), VAPID_PUBLIC_KEY, Promise.resolve('granted')),
    ).rejects.toThrow();

    expect(browser.current()).not.toBeNull();
    expect(browser.unsubscribeCalls()).toBe(0);
  });

  it('una suscripción fuera de contrato no llega al Worker y se retira', async () => {
    const fake = createFakeFetch();
    const browser = createFakePushBrowser({
      json: (endpoint) => ({ endpoint, keys: { p256dh: 'corta', auth: 'corta' } }),
    });

    await expect(
      enablePushNotices(browser, clientFor(fake), VAPID_PUBLIC_KEY, Promise.resolve('granted')),
    ).rejects.toThrow('no cumple el contrato');

    expect(fake.requests).toHaveLength(0);
    expect(browser.current()).toBeNull();
  });
});

describe('disablePushNotices', () => {
  it('retira la suscripción del navegador y se lo dice al Worker con su endpoint', async () => {
    const fake = createFakeFetch();
    fake.on('DELETE', '/push/subscription', noContent);
    const browser = createFakePushBrowser({
      permission: 'granted',
      subscribedWith: VAPID_PUBLIC_KEY,
    });
    const endpoint = browser.current()?.endpoint;

    await disablePushNotices(browser, clientFor(fake));

    expect(browser.current()).toBeNull();
    expect(fake.requests.map((request) => [request.method, request.body])).toStrictEqual([
      ['DELETE', { endpoint }],
    ]);
  });

  it('sin red se apaga igual: el endpoint ya está muerto y el fallo solo se registra', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fake = createFakeFetch();
    fake.on('DELETE', '/push/subscription', () => {
      throw new TypeError('Failed to fetch');
    });
    const browser = createFakePushBrowser({
      permission: 'granted',
      subscribedWith: VAPID_PUBLIC_KEY,
    });

    await expect(disablePushNotices(browser, clientFor(fake))).resolves.toBeUndefined();

    expect(browser.current()).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('sin suscripción no hace nada', async () => {
    const fake = createFakeFetch();

    await disablePushNotices(createFakePushBrowser(), clientFor(fake));

    expect(fake.requests).toHaveLength(0);
  });
});
