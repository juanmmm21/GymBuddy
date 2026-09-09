import {
  parseKilogramsToGrams,
  type Locale,
  type PersonalRecord,
  type ProgressionPointView,
} from '@gymbuddy/shared';
import { Surface } from '../../components/index';
import { spacing } from '../../design/tokens';
import {
  axisTicks,
  chartPath,
  chartY,
  layoutChart,
  projectValue,
  type ChartBox,
  type ChartValue,
} from '../../lib/chart';
import { cx } from '../../lib/cx';
import { formatShortDate, formatWeightLabel, formatWeightValue, pluralize } from '../../lib/format';
import { RECORD_LABELS } from './labels';
import { markValue, progressionMarks } from './progression-marks';
import styles from './ProgressionChart.module.css';

/**
 * El lienzo del SVG. Sus números son unidades del `viewBox`, no píxeles: la gráfica ocupa
 * el ancho de la columna y todo lo de dentro escala con ella, así que lo que se fija aquí
 * es la proporción. Los márgenes salen de la escala de espaciado y dejan sitio justo a las
 * etiquetas de los dos ejes.
 */
const VIEWBOX_WIDTH = 360;
const VIEWBOX_HEIGHT = 200;

const BOX: ChartBox = {
  width: VIEWBOX_WIDTH,
  height: VIEWBOX_HEIGHT,
  padding: {
    top: spacing.md,
    right: spacing.md,
    bottom: spacing.xl,
    left: spacing.xxl + spacing.md,
  },
};

/** Una sola sesión no es una tendencia: un punto suelto no se pinta como gráfica. */
const MIN_POINTS = 2;

const DOT_RADIUS = spacing.xxs;
const MARK_RADIUS = spacing.xs;
/** Separación entre una etiqueta y su eje. */
const LABEL_GAP = spacing.sm;

const AXIS_LEFT = BOX.padding.left;
const AXIS_RIGHT = VIEWBOX_WIDTH - BOX.padding.right;
const AXIS_BASELINE = VIEWBOX_HEIGHT - LABEL_GAP;

export interface ProgressionChartProps {
  /** De la sesión más antigua a la más reciente, tal como los da el contrato. */
  readonly points: readonly ProgressionPointView[];
  readonly records: readonly PersonalRecord[];
  readonly locale: Locale;
}

/**
 * Peso de la serie top y 1RM estimado de cada sesión, con las marcas encima. Va en SVG a
 * mano: una librería de gráficas pesa más que el resto de la PWA junta y ninguna respeta
 * los tokens del sistema de diseño. Aquí solo se pinta; la escala y las coordenadas salen
 * de `lib/chart.ts`, que es puro y tiene sus tests.
 */
export function ProgressionChart({ points, records, locale }: ProgressionChartProps) {
  const first = points.at(0);
  const last = points.at(-1);
  if (points.length < MIN_POINTS || first === undefined || last === undefined) return null;

  const series = points.map((point) => ({
    point,
    weight: toWeightValue(point),
    oneRepMax: toOneRepMaxValue(point),
  }));
  const weightValues = series.map((entry) => entry.weight);
  const oneRepMaxValues = series.map((entry) => entry.oneRepMax);

  // Las dos series comparten eje: el 1RM estimado se lee contra el peso que lo produjo.
  const layout = layoutChart([...weightValues, ...oneRepMaxValues], BOX);
  if (layout === null) return null;

  const marks = progressionMarks(points, records);
  const summary = `Peso y 1RM estimado en ${pluralize(points.length, 'sesión', 'sesiones')}: de ${formatWeightLabel(first.topWeight, locale)} el ${formatShortDate(first.startedAt, locale)} a ${formatWeightLabel(last.topWeight, locale)} el ${formatShortDate(last.startedAt, locale)}`;

  return (
    <Surface as="section" className={styles.card}>
      <h2 className={styles.title}>Progresión</h2>

      <svg
        className={styles.canvas}
        viewBox={`0 0 ${String(VIEWBOX_WIDTH)} ${String(VIEWBOX_HEIGHT)}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={summary}
      >
        {axisTicks(layout).map((tick) => {
          const y = chartY(layout, tick);
          return (
            <g key={tick}>
              <line className={styles.gridLine} x1={AXIS_LEFT} x2={AXIS_RIGHT} y1={y} y2={y} />
              <text
                className={styles.axisLabel}
                x={AXIS_LEFT - LABEL_GAP}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {formatWeightValue(tick, locale)}
              </text>
            </g>
          );
        })}

        <path className={styles.oneRepMaxLine} d={chartPath(layout, oneRepMaxValues)} />
        <path className={styles.weightLine} d={chartPath(layout, weightValues)} />

        {series.map((entry) => {
          const dot = projectValue(layout, entry.weight);
          return (
            <circle
              key={entry.point.sessionId}
              className={styles.dot}
              cx={dot.x}
              cy={dot.y}
              r={DOT_RADIUS}
            />
          );
        })}

        {marks.map((mark) => {
          const spot = projectValue(layout, {
            x: Date.parse(mark.point.startedAt),
            y: parseKilogramsToGrams(markValue(mark)),
          });
          return (
            <circle
              key={mark.record.id}
              className={styles.mark}
              cx={spot.x}
              cy={spot.y}
              r={MARK_RADIUS}
            >
              <title>
                {`${RECORD_LABELS[mark.record.kind]}: ${formatWeightLabel(markValue(mark), locale)} · ${formatShortDate(mark.point.startedAt, locale)}`}
              </title>
            </circle>
          );
        })}

        <text className={styles.axisLabel} x={AXIS_LEFT} y={AXIS_BASELINE} textAnchor="start">
          {formatShortDate(first.startedAt, locale)}
        </text>
        <text className={styles.axisLabel} x={AXIS_RIGHT} y={AXIS_BASELINE} textAnchor="end">
          {formatShortDate(last.startedAt, locale)}
        </text>
      </svg>

      <ul className={styles.legend} aria-label="Leyenda de la gráfica">
        <li className={styles.legendItem}>
          <span className={cx(styles.swatch, styles.weightSwatch)} aria-hidden="true" />
          Peso en kg
        </li>
        <li className={styles.legendItem}>
          <span className={cx(styles.swatch, styles.oneRepMaxSwatch)} aria-hidden="true" />
          1RM estimado
        </li>
        {marks.length > 0 && (
          <li className={styles.legendItem}>
            <span className={cx(styles.swatch, styles.markSwatch)} aria-hidden="true" />
            Marca personal
          </li>
        )}
      </ul>
    </Surface>
  );
}

function toWeightValue(point: ProgressionPointView): ChartValue {
  return { x: Date.parse(point.startedAt), y: parseKilogramsToGrams(point.topWeight) };
}

function toOneRepMaxValue(point: ProgressionPointView): ChartValue {
  return { x: Date.parse(point.startedAt), y: parseKilogramsToGrams(point.estimatedOneRepMax) };
}
