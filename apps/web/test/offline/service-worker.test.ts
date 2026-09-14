import { CATALOG_BASE_URL, CATALOG_VERSION } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import {
  CATALOG_GIF_URL_PATTERN,
  GIF_CACHE_MAX_AGE_SECONDS,
  GIF_CACHE_MAX_ENTRIES,
  GIF_CACHE_NAME,
  catalogGifRuntimeCaching,
  workboxOptions,
} from '../../src/offline/service-worker';
import { previewGifUrl } from '../../src/features/catalog/preview';
import { catalogBenchPressDetail } from '../fixtures';

const PINNED_GIF = `${CATALOG_BASE_URL}/pectorals/archer-push-up.gif`;

function matchesGif(url: string): boolean {
  return CATALOG_GIF_URL_PATTERN.test(url);
}

describe('qué GIFs guarda el service worker', () => {
  it('guarda un GIF del catálogo bajo el tag anclado', () => {
    expect(matchesGif(PINNED_GIF)).toBe(true);
    expect(matchesGif(`${CATALOG_BASE_URL}/levator-scapulae/side-push-neck-stretch.gif`)).toBe(
      true,
    );
  });

  it('guarda la URL tal y como la sirve el contrato del catálogo', () => {
    expect(matchesGif(catalogBenchPressDetail.gifUrl)).toBe(true);
  });

  it('no guarda las miniaturas del catálogo: ojear no puede echar los GIFs que se entrenan', () => {
    expect(matchesGif(previewGifUrl(PINNED_GIF))).toBe(false);
    expect(previewGifUrl(PINNED_GIF).startsWith(PINNED_GIF)).toBe(true);
  });

  it('no guarda nada de otra rama ni de otro tag', () => {
    const repo = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB';

    expect(matchesGif(`${repo}@main/pectorals/archer-push-up.gif`)).toBe(false);
    expect(matchesGif(`${repo}/pectorals/archer-push-up.gif`)).toBe(false);
    expect(matchesGif(`${repo}@v1.0.0/pectorals/archer-push-up.gif`)).toBe(false);
    // Un tag que empieza igual que el anclado sigue siendo otro tag.
    expect(matchesGif(`${repo}@${CATALOG_VERSION}1/pectorals/archer-push-up.gif`)).toBe(false);
  });

  it('no guarda nada de otro repositorio, otro host ni sin HTTPS', () => {
    expect(
      matchesGif(
        `https://cdn.jsdelivr.net/gh/x/ExerciseGymGifsDB@${CATALOG_VERSION}/pectorals/a.gif`,
      ),
    ).toBe(false);
    expect(matchesGif(PINNED_GIF.replace('cdn.jsdelivr.net', 'evil.example'))).toBe(false);
    expect(matchesGif(PINNED_GIF.replace('https://', 'http://'))).toBe(false);
    // El punto del host es literal: no vale cualquier carácter en su lugar.
    expect(matchesGif(PINNED_GIF.replace('cdn.jsdelivr', 'cdnXjsdelivr'))).toBe(false);
  });

  it('solo guarda GIFs: ni los JSON del mismo tag ni rutas a medias', () => {
    expect(matchesGif(`${CATALOG_BASE_URL}/api/es/muscles/pectorals.json`)).toBe(false);
    expect(matchesGif(`${CATALOG_BASE_URL}/archer-push-up.gif`)).toBe(false);
    expect(matchesGif(`${CATALOG_BASE_URL}/a/b/archer-push-up.gif`)).toBe(false);
    expect(matchesGif(`${PINNED_GIF}?v=2`)).toBe(false);
    expect(matchesGif('/api/v1/catalog/exercises/pectorals/archer-push-up.gif')).toBe(false);
  });
});

describe('cómo guarda los GIFs', () => {
  it('sirve primero lo guardado y solo acepta respuestas 200', () => {
    expect(catalogGifRuntimeCaching.handler).toBe('CacheFirst');
    expect(catalogGifRuntimeCaching.urlPattern).toBe(CATALOG_GIF_URL_PATTERN);
    // Una respuesta opaca (estado 0) podría ser un error guardado para siempre.
    expect(catalogGifRuntimeCaching.options?.cacheableResponse).toEqual({ statuses: [200] });
  });

  it('pone tope, caducidad y limpieza ante falta de espacio', () => {
    expect(catalogGifRuntimeCaching.options?.expiration).toEqual({
      maxEntries: GIF_CACHE_MAX_ENTRIES,
      maxAgeSeconds: GIF_CACHE_MAX_AGE_SECONDS,
      purgeOnQuotaError: true,
    });
    expect(GIF_CACHE_MAX_ENTRIES).toBeGreaterThan(0);
    expect(GIF_CACHE_MAX_AGE_SECONDS).toBe(7_776_000);
  });

  it('cada versión del catálogo tiene su propia caché', () => {
    expect(GIF_CACHE_NAME).toBe(`catalog-gifs-${CATALOG_VERSION}`);
    expect(catalogGifRuntimeCaching.options?.cacheName).toBe(GIF_CACHE_NAME);
  });
});

describe('las opciones del service worker', () => {
  it('llevan la caché de GIFs ya vistos', () => {
    expect(workboxOptions.runtimeCaching).toEqual([catalogGifRuntimeCaching]);
  });

  it('no precachean ningún GIF en el build', () => {
    const patterns = workboxOptions.globPatterns ?? [];

    expect(patterns.length).toBeGreaterThan(0);
    for (const pattern of patterns) {
      expect(pattern).not.toMatch(/gif/i);
    }
  });

  it('no responden una llamada a la API con el shell', () => {
    const denylist = workboxOptions.navigateFallbackDenylist ?? [];

    expect(denylist.some((rule) => rule.test('/api/v1/sessions/active'))).toBe(true);
    expect(denylist.some((rule) => rule.test('/history'))).toBe(false);
  });
});
