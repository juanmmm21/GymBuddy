/** Lo que hace falta del navegador para saber cómo se instala la app. */
export interface BrowserEnvironment {
  readonly userAgent: string;
  /** Distingue un iPad, que desde iPadOS 13 se anuncia como un Mac, de un Mac de verdad. */
  readonly maxTouchPoints: number;
  /** Abierta desde el icono de la pantalla de inicio: ya está instalada. */
  readonly standalone: boolean;
  /** La dirección que hay que copiar para abrirla en otro navegador. */
  readonly appUrl: string;
}

export type DevicePlatform = 'ios' | 'android' | 'desktop';

/** Apps con navegador propio que se reconocen por su user agent. */
export type InAppBrowserApp =
  | 'instagram'
  | 'facebook'
  | 'messenger'
  | 'telegram'
  | 'whatsapp'
  | 'tiktok'
  | 'snapchat'
  | 'linkedin'
  | 'line'
  | 'twitter'
  | 'google';

export type InstallSituation =
  | { readonly kind: 'installed' }
  /** `app` es `null` cuando es un navegador interno que no se anuncia con nombre. */
  | {
      readonly kind: 'in_app_browser';
      readonly platform: DevicePlatform;
      readonly app: InAppBrowserApp | null;
    }
  | { readonly kind: 'ios_safari' }
  | { readonly kind: 'ios_other_browser' }
  | { readonly kind: 'android' }
  | { readonly kind: 'desktop' };

/**
 * El orden importa: Messenger se anuncia también como Facebook (`FBAN`), así que va antes.
 */
const IN_APP_BROWSERS: readonly (readonly [RegExp, InAppBrowserApp])[] = [
  [/Instagram/i, 'instagram'],
  [/FBAN\/Messenger|FB_IAB\/(MESSENGER|Orca)/i, 'messenger'],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, 'facebook'],
  [/Telegram/i, 'telegram'],
  [/WhatsApp/i, 'whatsapp'],
  [/TikTok|musical_ly|BytedanceWebview/i, 'tiktok'],
  [/Snapchat/i, 'snapchat'],
  [/LinkedInApp/i, 'linkedin'],
  [/\bLine\//i, 'line'],
  [/Twitter/i, 'twitter'],
  [/\bGSA\//i, 'google'],
];

/** Navegadores de verdad en iOS que no son Safari: pueden abrirla, pero instalar es cosa de Safari. */
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo/i;

/**
 * Qué situación tiene delante quien quiere instalar la app. Pura: todo sale del entorno que
 * se le pasa, así que los tests prueban cada navegador sin tocar el `navigator` de jsdom.
 */
export function detectInstallSituation(environment: BrowserEnvironment): InstallSituation {
  if (environment.standalone) return { kind: 'installed' };

  const { userAgent } = environment;
  const platform = detectPlatform(environment);

  for (const [pattern, app] of IN_APP_BROWSERS) {
    if (pattern.test(userAgent)) return { kind: 'in_app_browser', platform, app };
  }
  if (isAnonymousWebView(userAgent, platform)) {
    return { kind: 'in_app_browser', platform, app: null };
  }

  switch (platform) {
    case 'ios':
      return IOS_OTHER_BROWSER.test(userAgent)
        ? { kind: 'ios_other_browser' }
        : { kind: 'ios_safari' };
    case 'android':
      return { kind: 'android' };
    case 'desktop':
      return { kind: 'desktop' };
  }
}

export function detectPlatform(environment: BrowserEnvironment): DevicePlatform {
  const { userAgent } = environment;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  // iPadOS pide la web de escritorio y se anuncia como Mac; un Mac no tiene pantalla táctil.
  if (/Macintosh/i.test(userAgent) && environment.maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

/**
 * Un navegador interno sin nombre. En Android, el WebView lleva `; wv)`. En iOS, un WKWebView
 * no lleva el `Safari/` que ponen Safari y los demás navegadores; una app instalada tampoco,
 * pero esa ya salió antes por `standalone`.
 */
function isAnonymousWebView(userAgent: string, platform: DevicePlatform): boolean {
  if (platform === 'android') return /;\s*wv\)/i.test(userAgent);
  if (platform === 'ios') {
    return /AppleWebKit/i.test(userAgent) && !/Safari\//i.test(userAgent);
  }
  return false;
}

const STANDALONE_QUERIES = ['(display-mode: standalone)', '(display-mode: fullscreen)'] as const;

/** Lee el entorno del navegador real. Sin `matchMedia` (jsdom) se da por no instalada. */
export function readBrowserEnvironment(window: Window): BrowserEnvironment {
  const { navigator } = window;
  const matchesStandalone =
    typeof window.matchMedia === 'function' &&
    STANDALONE_QUERIES.some((query) => window.matchMedia(query).matches);
  // Safari de iOS no entiende `display-mode` en versiones viejas: lo dice su `navigator.standalone`.
  const iosStandalone = (navigator as Navigator & { standalone?: unknown }).standalone === true;

  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: matchesStandalone || iosStandalone,
    appUrl: `${window.location.origin}/`,
  };
}
