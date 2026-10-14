import {
  bodyMapOpacity,
  colors,
  elevation,
  fontFamilies,
  fontWidths,
  motionDuration,
  motionEasing,
  motionShift,
  radius,
  sizes,
  spacing,
  themeColorMeta,
  typography,
} from './tokens';

/** Nombre de una variable CSS del sistema de diseño. */
export type CssVariableName = `--gb-${string}`;

export type CssVariables = Readonly<Record<CssVariableName, string>>;

const CSS_VARIABLE_PREFIX = '--gb';

/**
 * Traduce los tokens a variables CSS. Las hojas de estilo solo conocen estos nombres:
 * un `#d9480f` escrito en un `.css` es un error, y un test lo caza.
 */
export function cssVariablesFor(): CssVariables {
  const variables: Record<CssVariableName, string> = {};

  for (const [name, value] of Object.entries(colors)) {
    variables[variableName('color', kebabCase(name))] = value;
  }
  for (const [name, value] of Object.entries(elevation)) {
    variables[variableName('shadow', kebabCase(name))] = value;
  }
  for (const [name, value] of Object.entries(spacing)) {
    variables[variableName('space', name)] = pixels(value);
  }
  for (const [name, value] of Object.entries(radius)) {
    variables[variableName('radius', name)] = pixels(value);
  }
  for (const [name, value] of Object.entries(fontFamilies)) {
    variables[variableName('font', name)] = value;
  }
  for (const [name, value] of Object.entries(fontWidths)) {
    variables[variableName('font-width', name)] = value;
  }
  for (const [role, style] of Object.entries(typography)) {
    const base = `type-${kebabCase(role)}`;
    variables[variableName(base, 'size')] = pixels(style.size);
    variables[variableName(base, 'line')] = pixels(style.lineHeight);
    variables[variableName(base, 'weight')] = String(style.weight);
    variables[variableName(base, 'tracking')] = pixels(style.letterSpacing);
  }
  for (const [name, value] of Object.entries(motionDuration)) {
    variables[variableName('duration', name)] = `${String(value)}ms`;
  }
  for (const [name, value] of Object.entries(motionEasing)) {
    variables[variableName('ease', name)] = value;
  }
  for (const [name, value] of Object.entries(motionShift)) {
    variables[variableName('shift', name)] = pixels(value);
  }
  for (const [name, value] of Object.entries(bodyMapOpacity)) {
    variables[variableName('opacity-body-map', kebabCase(name))] = String(value);
  }
  for (const [name, value] of Object.entries(sizes)) {
    variables[variableName('size', kebabCase(name))] = pixels(value);
  }

  return variables;
}

/**
 * Vuelca los tokens en el elemento raíz y anuncia `theme-color` para que la barra de estado del
 * sistema acompañe al fondo. Se llama una vez, antes del primer render: hay un solo tema.
 */
export function installTheme(document: Document): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(cssVariablesFor())) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = 'dark';

  const meta = ensureThemeColorMeta(document);
  meta.setAttribute('content', themeColorMeta);
}

function ensureThemeColorMeta(document: Document): HTMLMetaElement {
  const existing = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (existing !== null) return existing;

  const meta = document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  document.head.appendChild(meta);
  return meta;
}

function variableName(group: string, name: string): CssVariableName {
  return `${CSS_VARIABLE_PREFIX}-${group}-${name}`;
}

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function pixels(value: number): string {
  return `${String(value)}px`;
}
