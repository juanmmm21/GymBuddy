/**
 * Tokens del sistema de diseño: la única fuente de colores, espaciados, tipografía y
 * movimiento de la PWA. Ninguna vista escribe un literal de estilo; todo sale de aquí y
 * llega a las hojas CSS como variables `--gb-*` (ver `theme.ts`).
 */

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
 * Paleta «Marcador» (elegida por Juan el 2026-10-14 entre seis maquetas; sustituye a «Discos»):
 * fondo casi negro, cifras blancas enormes y un verde lima que es la acción y lo que vas ganando.
 * El rojo se queda para el récord. Es un solo tema, oscuro: se pensó para leerse en un gimnasio, y
 * un tema claro sería otra dirección. Todos los pares de texto y fondo pasan 4,5:1 (WCAG AA), y un
 * test lo vigila.
 */
export const colors: ColorTokens = {
  canvas: '#0b0c0e',
  surface: '#16181c',
  surfaceRaised: '#1d2025',
  surfaceSunken: '#08090a',
  border: '#26292f',
  borderStrong: '#3a3e45',
  text: '#f2f3f5',
  textSecondary: '#c3c7ce',
  textMuted: '#9aa0a9',
  accent: '#c8ff3d',
  accentStrong: '#e4ff9e',
  onAccent: '#0b0c0e',
  accentSoft: '#1f2610',
  success: '#3ddc84',
  successSoft: '#0f2519',
  warning: '#ffb23d',
  warningSoft: '#2e220c',
  danger: '#ff7a70',
  dangerSoft: '#341513',
  record: '#ff5a4f',
  onRecord: '#0b0c0e',
  // La superficie que manda —la sesión en curso, empezar— es el propio lima, con texto negro.
  inverseSurface: '#c8ff3d',
  onInverse: '#0b0c0e',
  onInverseMuted: '#2f3b0e',
  plate25: '#ff5a4f',
  plate20: '#4f86e8',
  plate15: '#f2b705',
  plate10: '#3ddc84',
  plate5: '#f2f3f5',
  plate2p5: '#5c626b',
  plate1p25: '#c3c7ce',
  plateBar: '#5c626b',
  focusRing: '#c8ff3d',
  overlay: 'rgba(0, 0, 0, 0.72)',
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
  sm: 10,
  md: 14,
  lg: 20,
  /** Suficiente para que cualquier caja salga redondeada del todo. */
  pill: 999,
} as const;

export interface TypeStyle {
  readonly size: number;
  readonly lineHeight: number;
  readonly weight: 400 | 500 | 600 | 700 | 800;
  readonly letterSpacing: number;
}

/**
 * Barlow para el texto y Barlow Condensed para títulos y cifras: la de marcador deportivo, que mete
 * un peso con decimales en poco ancho. Las dos viajan **dentro de la app** (`@fontsource/*`,
 * importadas en `main.tsx`) y se precachean con el shell: en un gimnasio sin cobertura no se
 * descarga nada. Los números usan cifras tabulares para que el peso no baile (ver `global.css`).
 */
export const fontFamilies = {
  sans: "Barlow, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  display: "'Barlow Condensed', 'Arial Narrow', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
} as const;

/**
 * La anchura que piden las hojas con `font-stretch`. Barlow Condensed ya es estrecha de por sí, así
 * que se queda en la normal; el token sigue para que una fuente variable pueda volver a usarlo.
 */
export const fontWidths = {
  condensed: '100%',
} as const;

export const typography: Readonly<Record<TypeRole, TypeStyle>> = {
  // Display y headline van en Barlow Condensed: estrecha, así que crecen mucho sin partir líneas.
  display: { size: 56, lineHeight: 52, weight: 800, letterSpacing: 0 },
  headline: { size: 40, lineHeight: 40, weight: 800, letterSpacing: 0 },
  title: { size: 22, lineHeight: 26, weight: 700, letterSpacing: 0 },
  body: { size: 16, lineHeight: 22, weight: 400, letterSpacing: 0 },
  bodyStrong: { size: 16, lineHeight: 22, weight: 600, letterSpacing: 0 },
  caption: { size: 13, lineHeight: 18, weight: 400, letterSpacing: 0 },
  // Las etiquetas van en mayúsculas espaciadas, como los rótulos de un marcador.
  label: { size: 13, lineHeight: 16, weight: 600, letterSpacing: 1.8 },
};

export type TypeRole =
  'display' | 'headline' | 'title' | 'body' | 'bodyStrong' | 'caption' | 'label';

/** Duraciones en milisegundos. */
export const motionDuration = {
  fast: 120,
  base: 200,
  slow: 320,
  /**
   * Un paso del cronómetro, el mismo que `TICK_INTERVAL_MS` (un test lo vigila). La barra del
   * descanso recorre un segundo en exactamente esto, así que se vacía de forma continua aunque la
   * cifra de al lado solo cambie una vez por segundo.
   */
  tick: 1000,
  /**
   * Lo que se queda encendido un resalte que se apaga solo, como la serie recién apuntada. No es un
   * movimiento sino tiempo para encontrar con el ojo lo que acaba de cambiar, y por eso dura más
   * que los 120-200 ms de lo que se mueve.
   */
  linger: 1200,
  /**
   * Un ciclo de algo que se mueve solo y sin fin, como respirar: más rápido se lee como
   * nervio y distrae del cronómetro que tiene al lado.
   */
  ambient: 2400,
  /**
   * Lo que separa la entrada de una tarjeta de la siguiente en una lista. Lo justo para que se lea
   * que la lista cae en orden; con más, las últimas de la pantalla llegan tarde y la lista parece
   * pesada. Va con tope de escalones (ver `listEntranceDelayMs`): una lista larga no puede tardar
   * en pintarse lo que tarde en contar hasta cincuenta.
   */
  stagger: 40,
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
  /**
   * Lo que recorre algo pequeño que aparece dentro de una pantalla que ya está puesta: la serie
   * recién apuntada o el aviso de una marca. La mitad que una pantalla entera: nace donde va a
   * quedarse, solo hace falta que se note que no estaba.
   */
  nudge: 8,
} as const;

export const elevation: ElevationTokens = {
  raised: '0 1px 2px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.5)',
  sheet: '0 -8px 32px rgba(0, 0, 0, 0.6)',
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
export const themeColorMeta = colors.canvas;
