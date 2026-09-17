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
  /** Un récord personal: el rojo del disco de 25 kg, el más pesado de la barra. */
  readonly record: string;
  /** Texto encima de `record`. */
  readonly onRecord: string;
  /**
   * La superficie que manda en una pantalla —la sesión en curso en Hoy—: oscura en el tema claro y
   * azul profundo en el oscuro, para que destaque en los dos.
   */
  readonly inverseSurface: string;
  readonly onInverse: string;
  readonly onInverseMuted: string;
  /**
   * Los discos de la barra con su color de competición, para dibujarlos. No son texto sobre fondo y
   * no pasan por la regla de contraste; en oscuro se aclaran lo justo para no perderse en el fondo.
   */
  readonly plate25: string;
  readonly plate20: string;
  readonly plate15: string;
  readonly plate10: string;
  readonly plate5: string;
  readonly plate2p5: string;
  readonly plate1p25: string;
  /** La barra y su manguito, que asoman a los lados de los discos. */
  readonly plateBar: string;
  readonly focusRing: string;
  /** Velo detrás de una hoja modal. */
  readonly overlay: string;
};

/**
 * Paleta «Discos» (elegida por Juan el 2026-09-14): los colores de los discos de competición
 * dan significado en vez de decorar. El azul del de 20 kg es la acción y el rojo del de 25 kg,
 * el récord. Los neutros tiran a azul para que el acento no parezca pegado encima. Todos los pares
 * de texto y fondo pasan 4,5:1 de contraste (WCAG AA), y un test lo vigila: la app se lee de un
 * vistazo entre series, con la mano sudada y a medio brazo.
 */
export const colors: Readonly<Record<ColorScheme, ColorTokens>> = {
  light: {
    canvas: '#f3f5f8',
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    surfaceSunken: '#e9edf2',
    border: '#e2e6ec',
    borderStrong: '#c3cad5',
    text: '#121826',
    textSecondary: '#3d4658',
    textMuted: '#5f687a',
    accent: '#1f5fbf',
    accentStrong: '#174a96',
    onAccent: '#ffffff',
    accentSoft: '#e7effb',
    success: '#1b7541',
    successSoft: '#e4f3ea',
    warning: '#8f5f00',
    warningSoft: '#fff3d1',
    danger: '#c4213a',
    dangerSoft: '#fde8eb',
    record: '#d7263d',
    onRecord: '#ffffff',
    inverseSurface: '#121826',
    onInverse: '#ffffff',
    onInverseMuted: '#b9c2d3',
    plate25: '#d7263d',
    plate20: '#1f5fbf',
    plate15: '#e8a900',
    plate10: '#2e9e5b',
    plate5: '#f4f5f7',
    plate2p5: '#2b3140',
    plate1p25: '#9aa3b0',
    plateBar: '#8f98a6',
    focusRing: '#1f5fbf',
    overlay: 'rgba(18, 24, 38, 0.55)',
  },
  dark: {
    canvas: '#0e1117',
    surface: '#171b23',
    surfaceRaised: '#1f2530',
    surfaceSunken: '#0a0d12',
    border: '#282e39',
    borderStrong: '#3b4350',
    text: '#eef1f6',
    textSecondary: '#b6bdca',
    textMuted: '#8b93a2',
    accent: '#6f9dff',
    accentStrong: '#93b5ff',
    onAccent: '#0a1530',
    accentSoft: '#16233d',
    success: '#4cc47f',
    successSoft: '#0f2a1b',
    warning: '#f2b705',
    warningSoft: '#33290a',
    danger: '#ff6b7d',
    dangerSoft: '#3a1419',
    record: '#ff5a6e',
    onRecord: '#1f0006',
    inverseSurface: '#1a2b4c',
    onInverse: '#eef1f6',
    onInverseMuted: '#aebbd2',
    plate25: '#f0485c',
    plate20: '#4f86e8',
    plate15: '#f2b705',
    plate10: '#3fb872',
    plate5: '#e9ecf1',
    plate2p5: '#6b7484',
    plate1p25: '#c3cad5',
    plateBar: '#6b7484',
    focusRing: '#6f9dff',
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
  md: 14,
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
 * El texto corrido va con la fuente del sistema: pinta en el primer fotograma. Títulos y cifras
 * van con Archivo estrecha, que viaja **dentro de la app** (`@fontsource-variable/archivo`,
 * importada en `main.tsx`) y se precachea con el shell: en un gimnasio sin cobertura no se
 * descarga nada. Si aún no ha cargado, cae a una estrecha del sistema. Los números usan cifras
 * tabulares para que el peso no baile al cambiar de 80.00 a 82.50 (ver `global.css`).
 */
export const fontFamilies = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  display: "'Archivo Variable', 'Arial Narrow', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
} as const;

/**
 * Anchuras del eje `wdth` de Archivo. Estrecha, un peso con sus decimales y el récord caben en
 * una línea de móvil sin encoger la letra.
 */
export const fontWidths = {
  condensed: '78%',
} as const;

export const typography: Readonly<Record<TypeRole, TypeStyle>> = {
  // Display y headline van en Archivo estrecha: a igual tamaño ocupan menos, así que suben un punto.
  display: { size: 44, lineHeight: 46, weight: 700, letterSpacing: -0.4 },
  headline: { size: 32, lineHeight: 36, weight: 700, letterSpacing: -0.2 },
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

/**
 * Cuánto recorre algo que entra en pantalla, en píxeles. Lo justo para que se lea de dónde viene:
 * con más recorrido la navegación se siente lenta, y entre serie y serie eso es esperar.
 */
export const motionShift = {
  screen: 16,
} as const;

export const elevation: Readonly<Record<ColorScheme, ElevationTokens>> = {
  light: {
    raised: '0 1px 2px rgba(18, 24, 38, 0.06), 0 4px 12px rgba(18, 24, 38, 0.08)',
    sheet: '0 -8px 32px rgba(18, 24, 38, 0.18)',
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
  /**
   * El botón central de la sesión en curso: tan alto como la barra y asomando por encima, para que
   * el pulgar lo encuentre sin mirar entre serie y serie.
   */
  sessionButton: 64,
  /** La PWA es una columna: en una pantalla ancha no se estira, se centra. */
  contentMaxWidth: 560,
  borderWidth: 1,
  focusRingWidth: 3,
} as const;

/**
 * Lo opaca que sale cada zona de la silueta de la semana (opción B que eligió Juan el 2026-09-16):
 * `rest` es el cuerpo sin trabajar, que se ve pero no compite, y cada nivel de
 * `bodyPartLoadLevel` oscurece un escalón. Van sobre el color del texto del día, así que valen igual
 * en claro, en oscuro y con el día seleccionado.
 */
export const bodyMapOpacity = {
  rest: 0.2,
  level1: 0.45,
  level2: 0.65,
  level3: 0.82,
  level4: 1,
} as const;

/** Color que se anuncia al sistema en `theme-color`: la barra de estado acompaña al fondo. */
export const themeColorMeta: Readonly<Record<ColorScheme, string>> = {
  light: colors.light.canvas,
  dark: colors.dark.canvas,
};
