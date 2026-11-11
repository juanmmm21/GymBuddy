import type { DevicePlatform, InAppBrowserApp } from './platform';
import { t } from '../../i18n/index';

export const IN_APP_BROWSER_NAMES: Readonly<Record<InAppBrowserApp, string>> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  messenger: 'Messenger',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
  linkedin: 'LinkedIn',
  line: 'LINE',
  twitter: 'X',
  google: 'Google',
};

/** El nombre con el que se dice en una frase: «la app de Google», no «Google» a secas. */
export function inAppBrowserName(app: InAppBrowserApp): string {
  return app === 'google' ? t('la app de Google', 'the Google app') : IN_APP_BROWSER_NAMES[app];
}

/** El navegador en el que sí se puede instalar y crear la llave de acceso. */
export function recommendedBrowser(platform: DevicePlatform): string {
  switch (platform) {
    case 'ios':
      return 'Safari';
    case 'android':
      return 'Chrome';
    case 'desktop':
      return t('el navegador', 'your browser');
  }
}

export function inAppBrowserTitle(app: InAppBrowserApp | null): string {
  return app === null
    ? t('Estás dentro de otra app', 'You’re inside another app')
    : t(`Estás dentro de ${inAppBrowserName(app)}`, `You’re inside ${inAppBrowserName(app)}`);
}
