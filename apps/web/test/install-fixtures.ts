import { vi } from 'vitest';
import type { InstallPrompt } from '../src/features/install/install-prompt';
import { unavailableInstallPrompt } from '../src/features/install/install-prompt';
import type { InstallSupport } from '../src/features/install/InstallProvider';

/** User agents reales, copiados de cada navegador; no inventados. */
export const USER_AGENTS = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36',
  instagramIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.106 (iPhone15,2; iOS 17_5; es_ES; es; scale=3.00; 1179x2556; 619461904)',
  facebookAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.134 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/471.0.0.35.80;]',
  messengerIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/466.0.0.41.109;FBBV/620524133;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/es_ES;FBOP/5]',
  telegramAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 Telegram-Android/11.0.0 (Samsung SM-A536B; Android 13; SDK 33; AVERAGE)',
  googleAppIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/330.0.683493761 Mobile/15E148 Safari/604.1',
  iosWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
} as const;

/** Lo que manda Chrome: un evento con `prompt()` y la respuesta de la persona en `userChoice`. */
export function beforeInstallPromptEvent(
  outcome: 'accepted' | 'dismissed',
  prompt: () => Promise<void> = () => Promise.resolve(),
): Event {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(event, {
    prompt: vi.fn(prompt),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });
  return event;
}

export const APP_URL = 'https://gymbuddy.pages.dev/';

/** La app abierta en ese navegador, con el diálogo de instalación que se le pase. */
export function installSupport(
  userAgent: string,
  options: { readonly standalone?: boolean; readonly prompt?: InstallPrompt } = {},
): InstallSupport {
  return {
    environment: {
      userAgent,
      maxTouchPoints: /iPhone|Android/.test(userAgent) ? 5 : 0,
      standalone: options.standalone ?? false,
      appUrl: APP_URL,
    },
    prompt: options.prompt ?? unavailableInstallPrompt,
  };
}
