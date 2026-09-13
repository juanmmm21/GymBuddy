import type { DevicePlatform, InAppBrowserApp } from './platform';

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
  google: 'la app de Google',
};

/** El navegador en el que sí se puede instalar y crear la llave de acceso. */
export const RECOMMENDED_BROWSER: Readonly<Record<DevicePlatform, string>> = {
  ios: 'Safari',
  android: 'Chrome',
  desktop: 'el navegador',
};

export function inAppBrowserTitle(app: InAppBrowserApp | null): string {
  return app === null ? 'Estás dentro de otra app' : `Estás dentro de ${IN_APP_BROWSER_NAMES[app]}`;
}
