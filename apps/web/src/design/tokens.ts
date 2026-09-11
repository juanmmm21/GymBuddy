/**
 * Tokens del sistema de diseño: la única fuente de colores, espaciados, tipografía y
 * movimiento de la PWA. Ninguna vista escribe un literal de estilo; todo sale de aquí y
 * llega a las hojas CSS como variables `--gb-*` (ver `theme.ts`).
 */

export type ColorScheme = 'light' | 'dark';

// Alias de tipo y no `interface`: sin firma de índice implícita, `Object.entries` los
// devolvería como `any` al generar las variables CSS.
export type ColorTokens = {
  /** Fondo de la página. */
  readonly canvas: string;
  /** Fondo de una tarjeta o sección apoyada sobre el fondo. */
  readonly surface: string;
  /** Superficie elevada: hojas modales, menús. */
  readonly surfaceRaised: string;
  /** Superficie hundida: campos de texto, zonas de entrada. */
  readonly surfaceSunken: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly accent: string;
  readonly accentStrong: string;
  /** Texto y iconos que se pintan encima de `accent`. */
  readonly onAccent: string;
  /** Fondo teñido de acento para chips y avisos suaves. */
  readonly accentSoft: string;
  readonly success: string;
  readonly successSoft: string;
  readonly warning: string;
  readonly warningSoft: string;
  readonly danger: string;
  readonly dangerSoft: string;
  readonly focusRing: string;
  /** Velo detrás de una hoja modal. */
  readonly overlay: string;
};

export const colors: Readonly<Record<ColorScheme, ColorTokens>> = {
  light: {
    canvas: '#f4f5f7',
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    surfaceSunken: '#eceef2',
    border: '#e1e4ea',
    borderStrong: '#c5cad4',
    text: '#14161c',
    textSecondary: '#4c5160',
    textMuted: '#7c8394',
    accent: '#d9480f',
    accentStrong: '#b8390a',
    onAccent: '#ffffff',
    accentSoft: '#ffefe6',
    success: '#2b8a3e',
    successSoft: '#e6f5ea',
    warning: '#b35c00',
    warningSoft: '#fff3e0',
    danger: '#c92a2a',
    dangerSoft: '#fdecec',
    focusRing: '#d9480f',
    overlay: 'rgba(20, 22, 28, 0.55)',
  },
  dark: {
    canvas: '#0f1115',
    surface: '#171a21',
    surfaceRaised: '#1f232c',
    surfaceSunken: '#0b0d11',
    border: '#2a2f3a',
    borderStrong: '#3d4350',
    text: '#f2f3f5',
    textSecondary: '#b4b9c6',
    textMuted: '#7c8394',
    accent: '#ff7a3d',
    accentStrong: '#ff9361',
    onAccent: '#1a0a00',
    accentSoft: '#33200f',
    success: '#51cf66',
    successSoft: '#12301c',
    warning: '#ffa94d',
    warningSoft: '#3a2610',
    danger: '#ff6b6b',
    dangerSoft: '#3b1616',
    focusRing: '#ff7a3d',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
};

/** Escala de espaciado en píxeles, en múltiplos de 4. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  /** Suficiente para que cualquier caja salga redondeada del todo. */
  pill: 999,
} as const;

export interface TypeStyle {
  readonly size: number;
  readonly lineHeight: number;
  readonly weight: 400 | 500 | 600 | 700;
  readonly letterSpacing: number;
}

/**
 * Sin fuentes descargadas: la del sistema pinta en el primer fotograma y en un gimnasio
 * sin cobertura no hay nada que esperar. Los números usan cifras tabulares para que el
 * peso no baile al cambiar de 80.00 a 82.50 (ver `global.css`).
 */
export const fontFamilies = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
} as const;

export const typography: Readonly<Record<TypeRole, TypeStyle>> = {
  display: { size: 40, lineHeight: 44, weight: 700, letterSpacing: -0.8 },
  headline: { size: 28, lineHeight: 34, weight: 700, letterSpacing: -0.4 },
  title: { size: 20, lineHeight: 26, weight: 600, letterSpacing: -0.2 },
  body: { size: 16, lineHeight: 22, weight: 400, letterSpacing: 0 },
  bodyStrong: { size: 16, lineHeight: 22, weight: 600, letterSpacing: 0 },
  caption: { size: 13, lineHeight: 18, weight: 400, letterSpacing: 0 },
  label: { size: 12, lineHeight: 16, weight: 600, letterSpacing: 0.4 },
};

export type TypeRole =
  'display' | 'headline' | 'title' | 'body' | 'bodyStrong' | 'caption' | 'label';

/** Duraciones en milisegundos. */
export const motionDuration = {
  fast: 120,
  base: 200,
  slow: 320,
  /**
   * Un ciclo de algo que se mueve solo y sin fin, como respirar: más rápido se lee como
   * nervio y distrae del cronómetro que tiene al lado.
   */
  ambient: 2400,
} as const;

export const motionEasing = {
  /** Entra y sale con suavidad: transiciones de estado en el mismo sitio. */
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  /** Arranca rápido y frena: cosas que aparecen (hojas, avisos). */
  enter: 'cubic-bezier(0, 0, 0.2, 1)',
  /** Se va deprisa: cosas que desaparecen. */
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
} as const;

export const elevation: Readonly<Record<ColorScheme, ElevationTokens>> = {
  light: {
    raised: '0 1px 2px rgba(20, 22, 28, 0.06), 0 4px 12px rgba(20, 22, 28, 0.08)',
    sheet: '0 -8px 32px rgba(20, 22, 28, 0.18)',
  },
  dark: {
    raised: '0 1px 2px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.5)',
    sheet: '0 -8px 32px rgba(0, 0, 0, 0.6)',
  },
};

export type ElevationTokens = {
  readonly raised: string;
  readonly sheet: string;
};

/** Medidas de disposición en píxeles. */
export const sizes = {
  /** Mínimo táctil cómodo con el pulgar entre series. */
  touchTarget: 48,
  controlHeight: 44,
  tabBarHeight: 64,
  /** La PWA es una columna: en una pantalla ancha no se estira, se centra. */
  contentMaxWidth: 560,
  borderWidth: 1,
  focusRingWidth: 3,
} as const;

/** Color que se anuncia al sistema en `theme-color`: la barra de estado acompaña al fondo. */
export const themeColorMeta: Readonly<Record<ColorScheme, string>> = {
  light: colors.light.canvas,
  dark: colors.dark.canvas,
};
