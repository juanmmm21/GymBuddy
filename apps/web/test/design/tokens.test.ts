import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssVariablesFor, installTheme } from '../../src/design/theme';
import { colors, motionDuration, type ColorTokens } from '../../src/design/tokens';
import { TICK_INTERVAL_MS } from '../../src/hooks/use-now';

// Ruta relativa a la raíz del paquete: vitest arranca ahí, y bajo jsdom `import.meta.url` no es un fichero.
const SRC_DIR = join(process.cwd(), 'src');

describe('tokens de diseño', () => {
  it('genera el juego completo de variables', () => {
    expect(Object.keys(cssVariablesFor()).length).toBeGreaterThan(40);
  });

  it('traduce los nombres camelCase a kebab-case con el prefijo del proyecto', () => {
    const variables = cssVariablesFor();
    expect(variables['--gb-color-on-accent']).toBe(colors.onAccent);
    expect(variables['--gb-space-md']).toBe('12px');
    expect(variables['--gb-duration-base']).toBe('200ms');
    expect(variables['--gb-type-body-strong-weight']).toBe('600');
    expect(variables['--gb-font-width-condensed']).toBe('100%');
    expect(variables['--gb-color-on-record']).toBe(colors.onRecord);
    expect(variables['--gb-opacity-body-map-level1']).toBe('0.45');
  });

  it('un paso de la barra del descanso dura lo que un paso del cronómetro', () => {
    // Si dejan de coincidir, la barra se vacía a saltos o se adelanta a la cifra.
    expect(motionDuration.tick).toBe(TICK_INTERVAL_MS);
  });
});

/** Contraste WCAG entre dos colores `#rrggbb`. */
function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (left, right) => right - left,
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Texto que se lee encima de un fondo: cada par tiene que pasar AA en los dos esquemas. */
const READABLE_PAIRS: readonly (readonly [keyof ColorTokens, keyof ColorTokens])[] = [
  ['text', 'canvas'],
  ['text', 'surface'],
  ['textSecondary', 'surface'],
  ['textMuted', 'canvas'],
  ['textMuted', 'surface'],
  ['textMuted', 'surfaceSunken'],
  ['accent', 'surface'],
  ['accent', 'canvas'],
  ['onAccent', 'accent'],
  // El botón central de la sesión, cuando ya estás en ella.
  ['onAccent', 'accentStrong'],
  ['accent', 'accentSoft'],
  ['success', 'successSoft'],
  ['warning', 'warningSoft'],
  ['danger', 'dangerSoft'],
  ['onRecord', 'record'],
  ['onInverse', 'inverseSurface'],
  ['onInverseMuted', 'inverseSurface'],
];

describe('contraste de la paleta', () => {
  it('todo texto pasa 4,5:1 sobre su fondo', () => {
    const failing = READABLE_PAIRS.map(([foreground, background]) => ({
      pair: `${foreground}/${background}`,
      ratio: contrastRatio(colors[foreground], colors[background]),
    })).filter(({ ratio }) => ratio < 4.5);

    expect(failing).toEqual([]);
  });

  it('calcula el contraste como la norma: negro sobre blanco es 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });
});

describe('hojas de estilo', () => {
  const cssFiles = listFiles(SRC_DIR, '.css');
  const knownVariables = new Set(Object.keys(cssVariablesFor()));

  it('encuentra hojas de estilo que auditar', () => {
    expect(cssFiles.length).toBeGreaterThan(5);
  });

  it.each(cssFiles)('%s solo usa variables que existen en los tokens', (file) => {
    const css = readFileSync(join(SRC_DIR, file), 'utf8');
    const used = [...css.matchAll(/--gb-[a-z0-9-]+/g)].map((match) => match[0]);
    const unknown = used.filter((name) => !knownVariables.has(name));
    expect(unknown).toEqual([]);
  });

  it.each(cssFiles)('%s no escribe colores ni tipografías a mano', (file) => {
    const css = readFileSync(join(SRC_DIR, file), 'utf8');
    const literalColors = css.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/gi) ?? [];
    expect(literalColors).toEqual([]);
    // El `(?=\S)` ancla el lookahead al primer carácter del valor, no al espacio de antes.
    expect(css).not.toMatch(/font-family:\s*(?=\S)(?!var\(|inherit)/);
  });

  it.each(cssFiles)('%s no escribe medidas en píxeles fuera de las variables', (file) => {
    const css = readFileSync(join(SRC_DIR, file), 'utf8');
    const withoutMediaQueries = css.replace(/@media[^{]*\{/g, '');
    // `0.01ms` de reduced-motion y el `0` a secas no son literales de diseño.
    const pixelLiterals = withoutMediaQueries.match(/\b\d+(?:\.\d+)?px\b/g) ?? [];
    expect(pixelLiterals).toEqual([]);
  });
});

describe('installTheme', () => {
  it('vuelca las variables en el elemento raíz y anuncia el color al sistema', () => {
    installTheme(document);
    installTheme(document);

    expect(document.documentElement.style.getPropertyValue('--gb-color-canvas')).toBe(
      colors.canvas,
    );
    expect(document.documentElement.style.colorScheme).toBe('dark');
    const metas = document.head.querySelectorAll('meta[name="theme-color"]');
    expect(metas).toHaveLength(1);
    expect(metas[0]?.getAttribute('content')).toBe(colors.canvas);
  });
});

function listFiles(dir: string, extension: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith(extension)) {
      found.push(relative(SRC_DIR, join(entry.parentPath, entry.name)));
    }
  }
  return found.sort();
}
