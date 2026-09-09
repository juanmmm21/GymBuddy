/**
 * La geometría de una gráfica de líneas: traducir valores del dominio —un instante y un
 * peso en gramos— a coordenadas del `viewBox` de un SVG. Aquí está toda la aritmética de
 * la gráfica de progresión; el componente que la pinta no calcula nada.
 *
 * Las coordenadas van en unidades del `viewBox`, no en píxeles: el SVG escala con el ancho
 * de la columna y todo lo de dentro escala con él.
 */

/** Márgenes del lienzo. Es donde caen las etiquetas de los ejes, fuera del área de trazo. */
export interface ChartPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface ChartBox {
  readonly width: number;
  readonly height: number;
  readonly padding: ChartPadding;
}

/** Un valor a pintar: `x` es el instante en milisegundos y `y` la magnitud en gramos. */
export interface ChartValue {
  readonly x: number;
  readonly y: number;
}

/** Un punto ya proyectado, en coordenadas del `viewBox`. */
export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

/** El lienzo con sus dos dominios ya resueltos: lo que hace falta para proyectar. */
export interface ChartLayout {
  readonly box: ChartBox;
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  /** Distancia entre dos líneas de la rejilla, en gramos. */
  readonly yStep: number;
}

/**
 * Saltos con los que se reparte el eje de pesos, en gramos. Son cantidades que un
 * levantador reconoce (1, 2.5, 5, 10... kg), no potencias de diez: un eje de 3 en 3 kg se
 * lee peor que uno de 2,5 aunque reparta el rango más justo.
 */
const MAX_AXIS_STEP_GRAMS = 100_000;
const AXIS_STEPS_GRAMS = [
  1_000,
  2_500,
  5_000,
  10_000,
  25_000,
  50_000,
  MAX_AXIS_STEP_GRAMS,
] as const;

/** Divisiones a las que aspira el eje vertical: cuatro etiquetas caben en un móvil. */
const AXIS_INTERVALS = 3;

/** Decimales con los que se escribe una coordenada: más allá no se ve y alarga el `d`. */
const COORDINATE_DECIMALS = 2;

/**
 * Resuelve la escala de la gráfica a partir de todos los valores que va a contener —los de
 * todas sus series, para que compartan eje— y devuelve `null` si no queda ninguno usable.
 */
export function layoutChart(values: readonly ChartValue[], box: ChartBox): ChartLayout | null {
  const usable = values.filter((value) => Number.isFinite(value.x) && Number.isFinite(value.y));
  const first = usable[0];
  if (first === undefined) return null;

  let xMin = first.x;
  let xMax = first.x;
  let yMin = first.y;
  let yMax = first.y;
  for (const value of usable) {
    xMin = Math.min(xMin, value.x);
    xMax = Math.max(xMax, value.x);
    yMin = Math.min(yMin, value.y);
    yMax = Math.max(yMax, value.y);
  }

  const axis = weightAxis(yMin, yMax);
  return { box, xMin, xMax, yMin: axis.min, yMax: axis.max, yStep: axis.step };
}

/**
 * Coordenada horizontal de un instante. Una sola sesión no tiene recorrido temporal: su
 * punto se pinta en el centro en vez de dividir por cero o pegarlo al borde izquierdo.
 */
export function chartX(layout: ChartLayout, x: number): number {
  const { padding, width } = layout.box;
  const span = layout.xMax - layout.xMin;
  const drawable = width - padding.left - padding.right;
  if (span <= 0) return padding.left + drawable / 2;

  return padding.left + ((x - layout.xMin) / span) * drawable;
}

/** Coordenada vertical de una magnitud. El SVG crece hacia abajo y el peso, hacia arriba. */
export function chartY(layout: ChartLayout, y: number): number {
  const { padding, height } = layout.box;
  const span = layout.yMax - layout.yMin;
  const drawable = height - padding.top - padding.bottom;
  if (span <= 0) return padding.top + drawable / 2;

  return padding.top + drawable - ((y - layout.yMin) / span) * drawable;
}

export function projectValue(layout: ChartLayout, value: ChartValue): ChartPoint {
  return { x: chartX(layout, value.x), y: chartY(layout, value.y) };
}

/**
 * El atributo `d` de una línea, en el orden en que llegan los valores: el contrato ya los
 * da de la sesión más antigua a la más reciente y reordenarlos aquí escondería un fallo
 * del servidor. Un solo valor devuelve un `M` suelto, que no pinta nada; de eso se ocupa
 * el componente, que en ese caso pinta el punto y no la línea.
 */
export function chartPath(layout: ChartLayout, values: readonly ChartValue[]): string {
  const commands: string[] = [];

  for (const value of values) {
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) continue;

    const point = projectValue(layout, value);
    const command = commands.length === 0 ? 'M' : 'L';
    commands.push(`${command}${coordinate(point.x)} ${coordinate(point.y)}`);
  }

  return commands.join(' ');
}

/** Los pesos en los que cae una línea de la rejilla, de abajo arriba. */
export function axisTicks(layout: ChartLayout): number[] {
  if (layout.yStep <= 0) return [];

  const ticks: number[] = [];
  for (let value = layout.yMin; value <= layout.yMax; value += layout.yStep) {
    ticks.push(value);
  }
  return ticks;
}

interface WeightAxis {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/**
 * Los límites del eje de pesos, redondeados al salto elegido para que las etiquetas caigan
 * en números redondos. Nunca baja de cero: un peso negativo no existe y un eje que lo
 * insinúa se lee mal.
 */
function weightAxis(minGrams: number, maxGrams: number): WeightAxis {
  const span = maxGrams - minGrams;
  const step =
    AXIS_STEPS_GRAMS.find((candidate) => span / candidate <= AXIS_INTERVALS) ?? MAX_AXIS_STEP_GRAMS;

  const lower = Math.floor(minGrams / step) * step;
  const upper = Math.ceil(maxGrams / step) * step;
  // Un ejercicio que lleva semanas en el mismo peso cae justo en una línea de la rejilla y
  // se queda sin rango: se le da uno para que la línea plana salga a media altura.
  if (lower === upper) return { min: Math.max(0, lower - step), max: upper + step, step };

  return { min: Math.max(0, lower), max: upper, step };
}

function coordinate(value: number): string {
  return String(Number(value.toFixed(COORDINATE_DECIMALS)));
}
