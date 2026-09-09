import type { PersonalRecord, PersonalRecordKind, ProgressionPointView } from '@gymbuddy/shared';

/** La línea de la gráfica sobre la que cae una marca. */
export type ProgressionSeries = 'weight' | 'oneRepMax';

/** Una marca ya emparejada con la sesión en la que se consiguió. */
export interface ProgressionMark {
  readonly record: PersonalRecord;
  readonly series: ProgressionSeries;
  readonly point: ProgressionPointView;
}

/**
 * Los récords que caben en la escala de la gráfica: los dos que son un peso. El de volumen
 * es peso × repeticiones y va tres órdenes de magnitud por encima, así que pintarlo aquí
 * aplastaría las dos líneas contra el suelo; se queda en la lista de marcas.
 */
const SERIES_BY_KIND: Readonly<Partial<Record<PersonalRecordKind, ProgressionSeries>>> = {
  max_weight: 'weight',
  estimated_1rm: 'oneRepMax',
};

/**
 * Empareja cada marca con el punto de la gráfica en el que se consiguió. Una marca anterior
 * a la ventana de sesiones que devuelve el Worker no tiene punto donde caer y se descarta:
 * dibujarla en el primer punto la pondría en una sesión que no fue la suya.
 */
export function progressionMarks(
  points: readonly ProgressionPointView[],
  records: readonly PersonalRecord[],
): ProgressionMark[] {
  const marks: ProgressionMark[] = [];

  for (const record of records) {
    const series = SERIES_BY_KIND[record.kind];
    if (series === undefined) continue;

    const point = sessionOf(points, record.achievedAt);
    if (point === null) continue;

    marks.push({ record, series, point });
  }

  return marks;
}

/** El valor que la marca tiene sobre su línea, en la unidad del contrato. */
export function markValue(mark: ProgressionMark): string {
  // Se pinta el valor del punto y no el del récord aunque describan la misma serie: si
  // alguna vez discreparan, un marcador flotando fuera de su línea se leería como un fallo
  // de la gráfica en vez de como lo que sería, un dato inconsistente del servidor.
  return mark.series === 'weight' ? mark.point.topWeight : mark.point.estimatedOneRepMax;
}

/**
 * La sesión en la que cae un instante: la última que empezó antes de él. Una marca lleva
 * la hora de la serie que la consiguió, y esa serie pertenece a la sesión abierta entonces.
 */
function sessionOf(
  points: readonly ProgressionPointView[],
  achievedAt: string,
): ProgressionPointView | null {
  const moment = Date.parse(achievedAt);
  if (Number.isNaN(moment)) return null;

  let found: ProgressionPointView | null = null;
  let foundAt = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    const startedAt = Date.parse(point.startedAt);
    if (Number.isNaN(startedAt) || startedAt > moment || startedAt < foundAt) continue;

    found = point;
    foundAt = startedAt;
  }

  return found;
}
