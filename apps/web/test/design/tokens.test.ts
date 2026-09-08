import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssVariablesFor, installTheme, watchColorScheme } from '../../src/design/theme';
import { colors } from '../../src/design/tokens';

// Ruta relativa a la raíz del paquete: vitest arranca ahí, y bajo jsdom `import.meta.url` no es un fichero.
const SRC_DIR = join(process.cwd(), 'src');

describe('tokens de diseño', () => {
  it('los dos esquemas definen exactamente las mismas variables', () => {
    const light = Object.keys(cssVariablesFor('light')).sort();
    const dark = Object.keys(cssVariablesFor('dark')).sort();
    expect(dark).toEqual(light);
    expect(light.length).toBeGreaterThan(40);
  });

  it('cada color del tema claro tiene su pareja en el oscuro', () => {
    expect(Object.keys(colors.dark).sort()).toEqual(Object.keys(colors.light).sort());
  });

  it('traduce los nombres camelCase a kebab-case con el prefijo del proyecto', () => {
    const variables = cssVariablesFor('light');
    expect(variables['--gb-color-on-accent']).toBe(colors.light.onAccent);
    expect(variables['--gb-space-md']).toBe('12px');
    expect(variables['--gb-duration-base']).toBe('200ms');
    expect(variables['--gb-type-body-strong-weight']).toBe('600');
  });
});

describe('hojas de estilo', () => {
  const cssFiles = listFiles(SRC_DIR, '.css');
  const knownVariables = new Set(Object.keys(cssVariablesFor('light')));

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
    installTheme(document, 'dark');

    expect(document.documentElement.style.getPropertyValue('--gb-color-canvas')).toBe(
      colors.dark.canvas,
    );
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      colors.dark.canvas,
    );

    installTheme(document, 'light');
    expect(document.documentElement.style.getPropertyValue('--gb-color-canvas')).toBe(
      colors.light.canvas,
    );
    expect(document.head.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
  });
});

describe('watchColorScheme', () => {
  it('sigue al sistema y deja de escuchar al cancelar', () => {
    const listeners = new Set<() => void>();
    const query = {
      matches: true,
      addEventListener: (_: 'change', listener: () => void) => listeners.add(listener),
      removeEventListener: (_: 'change', listener: () => void) => listeners.delete(listener),
    };
    const fakeWindow = { matchMedia: () => query } as unknown as Window;
    const seen: string[] = [];

    const stop = watchColorScheme(fakeWindow, (scheme) => seen.push(scheme));
    expect(seen).toEqual(['dark']);

    query.matches = false;
    for (const listener of listeners) listener();
    expect(seen).toEqual(['dark', 'light']);

    stop();
    expect(listeners.size).toBe(0);
  });

  it('asume el tema claro cuando no existe matchMedia', () => {
    const seen: string[] = [];
    watchColorScheme({} as Window, (scheme) => seen.push(scheme));
    expect(seen).toEqual(['light']);
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
