import { describe, expect, it } from 'vitest';
import {
  detectInstallSituation,
  detectPlatform,
  readBrowserEnvironment,
  type BrowserEnvironment,
} from '../../src/features/install/platform';
import { USER_AGENTS } from '../install-fixtures';

function environment(
  userAgent: string,
  overrides: Partial<BrowserEnvironment> = {},
): BrowserEnvironment {
  return {
    userAgent,
    maxTouchPoints: /iPhone|Android/.test(userAgent) ? 5 : 0,
    standalone: false,
    appUrl: 'https://gymbuddy.pages.dev/',
    ...overrides,
  };
}

describe('detectInstallSituation', () => {
  it('abierta desde la pantalla de inicio ya está instalada, sea cual sea el navegador', () => {
    expect(
      detectInstallSituation(environment(USER_AGENTS.iphoneSafari, { standalone: true })),
    ).toEqual({ kind: 'installed' });
    // La app instalada en iOS no lleva `Safari/`: no puede confundirse con un navegador interno.
    expect(
      detectInstallSituation(environment(USER_AGENTS.iosWebView, { standalone: true })),
    ).toEqual({ kind: 'installed' });
  });

  it('Safari de iPhone y Chrome de Android', () => {
    expect(detectInstallSituation(environment(USER_AGENTS.iphoneSafari))).toEqual({
      kind: 'ios_safari',
    });
    expect(detectInstallSituation(environment(USER_AGENTS.androidChrome))).toEqual({
      kind: 'android',
    });
  });

  it('Chrome y Firefox en iPhone se mandan a Safari', () => {
    expect(detectInstallSituation(environment(USER_AGENTS.iphoneChrome))).toEqual({
      kind: 'ios_other_browser',
    });
    expect(detectInstallSituation(environment(USER_AGENTS.iphoneFirefox))).toEqual({
      kind: 'ios_other_browser',
    });
  });

  it('reconoce por su nombre los navegadores internos de las apps', () => {
    expect(detectInstallSituation(environment(USER_AGENTS.instagramIos))).toEqual({
      kind: 'in_app_browser',
      platform: 'ios',
      app: 'instagram',
    });
    expect(detectInstallSituation(environment(USER_AGENTS.facebookAndroid))).toEqual({
      kind: 'in_app_browser',
      platform: 'android',
      app: 'facebook',
    });
    expect(detectInstallSituation(environment(USER_AGENTS.telegramAndroid))).toEqual({
      kind: 'in_app_browser',
      platform: 'android',
      app: 'telegram',
    });
    expect(detectInstallSituation(environment(USER_AGENTS.googleAppIos))).toEqual({
      kind: 'in_app_browser',
      platform: 'ios',
      app: 'google',
    });
  });

  it('Messenger no pasa por Facebook aunque también se anuncie con FBAN', () => {
    expect(detectInstallSituation(environment(USER_AGENTS.messengerIos))).toEqual({
      kind: 'in_app_browser',
      platform: 'ios',
      app: 'messenger',
    });
  });

  it('un navegador interno sin nombre se detecta igual, sin inventarle la app', () => {
    expect(detectInstallSituation(environment(USER_AGENTS.androidWebView))).toEqual({
      kind: 'in_app_browser',
      platform: 'android',
      app: null,
    });
    expect(detectInstallSituation(environment(USER_AGENTS.iosWebView))).toEqual({
      kind: 'in_app_browser',
      platform: 'ios',
      app: null,
    });
  });

  it('un ordenador es escritorio', () => {
    expect(detectInstallSituation(environment(USER_AGENTS.desktopChrome))).toEqual({
      kind: 'desktop',
    });
  });
});

describe('detectPlatform', () => {
  it('un iPad que se anuncia como Mac se reconoce por la pantalla táctil', () => {
    expect(detectPlatform(environment(USER_AGENTS.macSafari, { maxTouchPoints: 5 }))).toBe('ios');
    expect(detectPlatform(environment(USER_AGENTS.macSafari, { maxTouchPoints: 0 }))).toBe(
      'desktop',
    );
  });
});

describe('readBrowserEnvironment', () => {
  const fakeWindow = (options: {
    readonly standaloneQuery: boolean;
    readonly iosStandalone?: boolean;
    readonly matchMedia?: boolean;
  }): Window =>
    ({
      navigator: {
        userAgent: USER_AGENTS.iphoneSafari,
        maxTouchPoints: 5,
        ...(options.iosStandalone === undefined ? {} : { standalone: options.iosStandalone }),
      },
      location: { origin: 'https://gymbuddy.pages.dev' },
      ...(options.matchMedia === false
        ? {}
        : {
            matchMedia: (query: string) => ({
              matches: options.standaloneQuery && query === '(display-mode: standalone)',
            }),
          }),
    }) as unknown as Window;

  it('lee el user agent, la pantalla táctil y la dirección de la app', () => {
    expect(readBrowserEnvironment(fakeWindow({ standaloneQuery: false }))).toEqual({
      userAgent: USER_AGENTS.iphoneSafari,
      maxTouchPoints: 5,
      standalone: false,
      appUrl: 'https://gymbuddy.pages.dev/',
    });
  });

  it('instalada por display-mode o por el navigator.standalone de iOS', () => {
    expect(readBrowserEnvironment(fakeWindow({ standaloneQuery: true })).standalone).toBe(true);
    expect(
      readBrowserEnvironment(fakeWindow({ standaloneQuery: false, iosStandalone: true }))
        .standalone,
    ).toBe(true);
  });

  it('sin matchMedia no revienta y la da por no instalada', () => {
    expect(
      readBrowserEnvironment(fakeWindow({ standaloneQuery: false, matchMedia: false })).standalone,
    ).toBe(false);
  });
});
