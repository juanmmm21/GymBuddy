import { CATALOG_BASE_URL } from '@gymbuddy/shared';
import type { VitePWAOptions } from 'vite-plugin-pwa';

/**
 * Las opciones de workbox tal y como las acepta `vite-plugin-pwa`. Se derivan de sus tipos
 * porque `workbox-build` no es dependencia directa de la PWA.
 */
export type WorkboxOptions = NonNullable<VitePWAOptions['workbox']>;
export type RuntimeCachingRule = NonNullable<WorkboxOptions['runtimeCaching']>[number];

/** Nombre de la caché del service worker; lleva el tag para que cada versión viva aparte. */
export const GIF_CACHE_NAME = `catalog-gifs-${CATALOG_BASE_URL.slice(CATALOG_BASE_URL.lastIndexOf('@') + 1)}`;

/**
 * Tope de GIFs guardados. Pesan entre 200 y 650 KB (medidos contra el CDN), así que ciento
 * cincuenta son del orden de 45 a 90 MB: de sobra para los ejercicios que alguien sigue y lo
 * que ojea del catálogo, y lejos de lo que Safari deja a una PWA instalada. Al pasarse, se va
 * el menos usado.
 */
export const GIF_CACHE_MAX_ENTRIES = 150;

/**
 * Caducidad de un GIF guardado. El tag es inmutable y un GIF no cambia nunca dentro de él:
 * esto no es para refrescar, sino para que lo que no se mira en meses deje sitio.
 */
export const GIF_CACHE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * Qué peticiones entran en la caché: solo GIFs bajo el tag anclado del catálogo. Es una
 * `RegExp` y no una función porque workbox serializa la regla con `toString()` al generar el
 * `sw.js`, y una función que leyera `CATALOG_BASE_URL` se quedaría sin la constante. Los JSON
 * del mismo tag no entran: esos los lee el Worker, nunca la PWA.
 */
export const CATALOG_GIF_URL_PATTERN = new RegExp(
  `^${escapeRegExp(CATALOG_BASE_URL)}/[^/?#]+/[^/?#]+\\.gif$`,
);

/**
 * Los GIFs ya vistos se sirven desde el dispositivo (Fase 13, ADR 0007). Solo se guarda lo que
 * el navegador ya descargó al mirar una ficha: nada se precachea en el build, porque el
 * catálogo no se vendoriza (ADR 0001) y guardar en el navegador de quien lo mira no es lo
 * mismo que distribuirlo.
 *
 * `CacheFirst` porque dentro de un tag un GIF no cambia. Solo se guardan respuestas 200: la
 * `<img>` pide en modo CORS (`crossOrigin="anonymous"` en `ExerciseGif`) y jsDelivr contesta
 * con `Access-Control-Allow-Origin: *`, así que nunca hace falta aceptar una respuesta opaca
 * (estado 0), que podría ser un error guardado para siempre y que Chrome cuenta en la cuota
 * como varios megas por entrada.
 */
export const catalogGifRuntimeCaching: RuntimeCachingRule = {
  urlPattern: CATALOG_GIF_URL_PATTERN,
  handler: 'CacheFirst',
  options: {
    cacheName: GIF_CACHE_NAME,
    cacheableResponse: { statuses: [200] },
    expiration: {
      maxEntries: GIF_CACHE_MAX_ENTRIES,
      maxAgeSeconds: GIF_CACHE_MAX_AGE_SECONDS,
      purgeOnQuotaError: true,
    },
  },
};

/**
 * Lo que genera el `sw.js`. Se precachea el shell y nada más: ni un GIF del catálogo entra en
 * el build (ADR 0001), solo en la caché de lo ya visto.
 */
export const workboxOptions: WorkboxOptions = {
  globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
  // Una petición a la API que falle no puede responderse con el index.html del shell.
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching: [catalogGifRuntimeCaching],
};
