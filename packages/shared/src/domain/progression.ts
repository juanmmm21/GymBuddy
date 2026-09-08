/**
 * Progresión: lo que convierte una lista de series en las tres respuestas que da la app
 * —cuánto suelo levantar, cuánto podría levantar una sola vez y cuánto trabajo hice—.
 *
 * Todo es aritmética entera sobre gramos. Son funciones puras: no saben de Workers, ni de
 * React, ni de la base. Las ejecutan los dos lados (`AGENTS.md` §5).
 */

import { parseKilogramsToGrams } from './units';

/**
 * Una serie tal y como la entiende el dominio: el peso ya en gramos enteros. Quien tenga
 * la forma del contrato (`"82.50"`) la convierte antes con `toProgressionSet`, para que
 * ni un solo cálculo pase por coma flotante.
 */
export interface ProgressionSet {
  readonly weightGrams: number;
  readonly reps: number;
  readonly isWarmup: boolean;
  readonly completedAt: string;
}

/** Una sesión reducida a lo que necesita la progresión: cuándo empezó y qué se levantó. */
export interface ProgressionSession {
  readonly sessionId: string;
  readonly startedAt: string;
  readonly sets: readonly ProgressionSet[];
}

/**
 * La serie efectiva más pesada de una sesión. Es la unidad de la que sale todo lo demás:
 * el peso habitual, la gráfica de progresión y la detección de estancamiento.
 */
export interface SessionTopSet {
  readonly sessionId: string;
  readonly startedAt: string;
  readonly weightGrams: number;
  readonly reps: number;
}

/** El peso habitual con el contexto que necesita la pantalla para explicarlo. */
export interface WorkingWeightSummary {
  readonly weightGrams: number;
  readonly reps: number;
  readonly lastPerformedAt: string;
  readonly sessionCount: number;
}

/** Un punto de la gráfica de progresión: una sesión resumida. */
export interface ProgressionPoint {
  readonly sessionId: string;
  readonly startedAt: string;
  readonly topWeightGrams: number;
  readonly topReps: number;
  readonly estimatedOneRepMaxGrams: number;
  readonly volumeGrams: number;
  readonly totalReps: number;
  readonly setCount: number;
}

/** Sesiones que entran en el peso habitual. Cinco cubren un mes de un ejercicio semanal. */
export const WORKING_WEIGHT_SESSIONS = 5;

/**
 * El divisor de la fórmula de Epley (`w × (1 + reps/30)`). Se exporta porque el Worker
 * necesita el mismo número dentro de SQL para ordenar por 1RM sin traerse el historial.
 */
export const EPLEY_REP_DIVISOR = 30;

/**
 * Traduce una serie del contrato al dominio. Acepta cualquier objeto con esa forma —un
 * `SetEntry` lo es— en vez de importar el esquema: el dominio no depende del contrato.
 */
export function toProgressionSet(entry: {
  readonly weight: string;
  readonly reps: number;
  readonly isWarmup: boolean;
  readonly completedAt: string;
}): ProgressionSet {
  return {
    weightGrams: parseKilogramsToGrams(entry.weight),
    reps: entry.reps,
    isWarmup: entry.isWarmup,
    completedAt: entry.completedAt,
  };
}

/** Las series que cuentan. El calentamiento no representa lo que el usuario mueve de verdad. */
export function effectiveSets(sets: readonly ProgressionSet[]): ProgressionSet[] {
  return sets.filter((set) => !set.isWarmup);
}

/**
 * La serie efectiva más pesada. El empate de peso lo rompen las repeticiones y, si también
 * empatan, la más reciente: entre dos series iguales interesa la que costó más trabajo.
 */
export function heaviestSet(sets: readonly ProgressionSet[]): ProgressionSet | null {
  let best: ProgressionSet | null = null;

  for (const set of effectiveSets(sets)) {
    if (best === null || comparesHeavier(set, best)) best = set;
  }

  return best;
}

/**
 * 1RM estimado por la fórmula de Epley, `w × (1 + reps/30)`, en gramos enteros. Se opera
 * con el numerador entero y se divide una sola vez, con redondeo explícito al alza en el
 * empate: multiplicar por `(1 + reps/30)` en coma flotante devuelve 82499.99… para pesos
 * que son exactos, y ese error acabaría pintado en la gráfica.
 */
export function estimateOneRepMaxGrams(weightGrams: number, reps: number): number {
  assertNonNegativeInteger(weightGrams, 'peso en gramos');
  assertPositiveInteger(reps, 'repeticiones');

  return divideRoundingHalfUp(weightGrams * (EPLEY_REP_DIVISOR + reps), EPLEY_REP_DIVISOR);
}

/**
 * El mismo 1RM de Epley a partir del numerador `w × (30 + reps)`. Existe porque ordenar
 * por ese numerador ordena igual que por el 1RM, así que el Worker deja que SQL halle el
 * máximo y lo convierte aquí, en vez de traerse el historial entero para buscar el mejor.
 */
export function oneRepMaxFromEpleyNumerator(numerator: number): number {
  assertNonNegativeInteger(numerator, 'numerador de Epley');

  return divideRoundingHalfUp(numerator, EPLEY_REP_DIVISOR);
}

/** Volumen de una serie: peso × repeticiones, en gramos. */
export function setVolumeGrams(set: ProgressionSet): number {
  assertNonNegativeInteger(set.weightGrams, 'peso en gramos');
  assertPositiveInteger(set.reps, 'repeticiones');

  return set.weightGrams * set.reps;
}

/** Volumen de una sesión: la suma de sus series efectivas. El calentamiento no suma. */
export function sessionVolumeGrams(sets: readonly ProgressionSet[]): number {
  return effectiveSets(sets).reduce((total, set) => total + setVolumeGrams(set), 0);
}

/**
 * La serie más pesada de cada sesión, de la más reciente a la más antigua. Las sesiones
 * sin ninguna serie efectiva se caen: una sesión de solo calentamiento no dice nada del
 * peso habitual, y contarla como hueco cortaría la mediana con un valor que no existe.
 */
export function topSetsBySession(sessions: readonly ProgressionSession[]): SessionTopSet[] {
  const tops: SessionTopSet[] = [];

  for (const session of sessions) {
    const top = heaviestSet(session.sets);
    if (top === null) continue;

    tops.push({
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      weightGrams: top.weightGrams,
      reps: top.reps,
    });
  }

  return sortByStartedAtDesc(tops);
}

/**
 * Peso habitual: la mediana del peso de la serie efectiva más pesada de las últimas
 * `sessionLimit` sesiones. Es la respuesta a "¿cuánto suelo levantar aquí?", y por eso es
 * una mediana y no la última serie: un día malo o un día suelto de prueba no la mueven.
 */
export function workingWeightGrams(
  topSets: readonly SessionTopSet[],
  sessionLimit: number = WORKING_WEIGHT_SESSIONS,
): number | null {
  assertPositiveInteger(sessionLimit, 'límite de sesiones');

  const considered = sortByStartedAtDesc(topSets).slice(0, sessionLimit);
  if (considered.length === 0) return null;

  return medianGrams(considered.map((top) => top.weightGrams));
}

/**
 * El peso habitual con lo que hace falta para pintarlo: las repeticiones de la última vez
 * —que son las que precargan el formulario—, cuándo fue y sobre cuántas sesiones se calculó.
 */
export function summarizeWorkingWeight(
  topSets: readonly SessionTopSet[],
  sessionLimit: number = WORKING_WEIGHT_SESSIONS,
): WorkingWeightSummary | null {
  const considered = sortByStartedAtDesc(topSets).slice(0, sessionLimit);
  const [latest] = considered;
  if (latest === undefined) return null;

  return {
    weightGrams: medianGrams(considered.map((top) => top.weightGrams)),
    reps: latest.reps,
    lastPerformedAt: latest.startedAt,
    sessionCount: considered.length,
  };
}

/**
 * Los puntos de la gráfica, de la sesión más antigua a la más reciente, que es como se
 * lee un eje temporal. Las sesiones sin serie efectiva no pintan punto.
 */
export function progressionPoints(sessions: readonly ProgressionSession[]): ProgressionPoint[] {
  const points: ProgressionPoint[] = [];

  for (const session of sessions) {
    const effective = effectiveSets(session.sets);
    const top = heaviestSet(effective);
    const estimated = bestEstimatedOneRepMaxGrams(effective);
    if (top === null || estimated === null) continue;

    points.push({
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      topWeightGrams: top.weightGrams,
      topReps: top.reps,
      estimatedOneRepMaxGrams: estimated,
      volumeGrams: sessionVolumeGrams(effective),
      totalReps: effective.reduce((total, set) => total + set.reps, 0),
      setCount: effective.length,
    });
  }

  return points.sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
}

/**
 * El mejor 1RM estimado de un grupo de series. No tiene por qué salir de la más pesada:
 * 80 kg × 8 estima más que 85 kg × 5, y esa es justo la gracia de la fórmula.
 */
export function bestEstimatedOneRepMaxGrams(sets: readonly ProgressionSet[]): number | null {
  let best: number | null = null;

  for (const set of effectiveSets(sets)) {
    const estimated = estimateOneRepMaxGrams(set.weightGrams, set.reps);
    if (best === null || estimated > best) best = estimated;
  }

  return best;
}

/**
 * Mediana en gramos enteros. Con un número par de valores el punto medio cae entre dos
 * pesos, así que la media de los dos centrales se redondea al alza de forma explícita:
 * dejar ahí un 81250.5 metería la coma flotante justo donde se prohíbe.
 */
function medianGrams(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.length >> 1;
  const upper = sorted[middle];
  if (upper === undefined) throw new RangeError('No hay valores de los que sacar la mediana');

  if (sorted.length % 2 === 1) return upper;

  const lower = sorted[middle - 1];
  if (lower === undefined) throw new RangeError('No hay valores de los que sacar la mediana');

  return divideRoundingHalfUp(lower + upper, 2);
}

function comparesHeavier(candidate: ProgressionSet, best: ProgressionSet): boolean {
  if (candidate.weightGrams !== best.weightGrams) return candidate.weightGrams > best.weightGrams;
  if (candidate.reps !== best.reps) return candidate.reps > best.reps;

  return Date.parse(candidate.completedAt) > Date.parse(best.completedAt);
}

function sortByStartedAtDesc<T extends { readonly startedAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
}

/** División entera con redondeo al alza en el empate. Ambos operandos son enteros positivos. */
function divideRoundingHalfUp(numerator: number, denominator: number): number {
  const quotient = Math.floor(numerator / denominator);
  const remainder = numerator - quotient * denominator;

  return remainder * 2 >= denominator ? quotient + 1 : quotient;
}

function assertNonNegativeInteger(value: number, description: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Valor no admitido para ${description}: ${String(value)}`);
  }
}

function assertPositiveInteger(value: number, description: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`Valor no admitido para ${description}: ${String(value)}`);
  }
}
