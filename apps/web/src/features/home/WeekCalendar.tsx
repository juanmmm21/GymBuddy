import {
  parseVolumeKilogramsToGrams,
  type Locale,
  type WeeklyCalendar,
  type WeeklyCalendarDay,
} from '@gymbuddy/shared';
import { useWeeklyCalendar } from '../../api/queries';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Surface } from '../../components/index';
import { formatVolumeLabel } from '../../lib/format';
import { BODY_PART_LABELS } from '../catalog/labels';
import styles from './WeekCalendar.module.css';
import { REST_DAY_LABEL, UNCLASSIFIED_DAY_LABEL, WEEKDAY_INITIALS, WEEKDAY_NAMES } from './labels';

export interface WeekCalendarProps {
  readonly locale: Locale;
}

/**
 * La semana en curso de un vistazo: siete columnas y, en cada una, la parte del cuerpo que
 * más volumen tuvo ese día. Una sola etiqueta por día a propósito — listar las tres partes
 * de una sesión no cabe en el ancho de un móvil.
 */
export function WeekCalendar({ locale }: WeekCalendarProps) {
  const week = useWeeklyCalendar();

  return (
    <Surface as="section">
      <p className={styles.sectionLabel}>Esta semana</p>
      <AsyncContent query={week}>{(data) => <WeekRow week={data} locale={locale} />}</AsyncContent>
    </Surface>
  );
}

interface WeekRowProps {
  readonly week: WeeklyCalendar;
  readonly locale: Locale;
}

function WeekRow({ week, locale }: WeekRowProps) {
  // "Hoy" se decide en UTC, igual que el reparto de los días que hace el Worker: mezclar
  // las dos zonas dejaría el día señalado y su etiqueta describiendo días distintos.
  const today = week.generatedAt.slice(0, 10);

  return (
    <ol className={styles.week}>
      {week.days.map((day) => (
        <DayCell key={day.date} day={day} locale={locale} isToday={day.date === today} />
      ))}
    </ol>
  );
}

interface DayCellProps {
  readonly day: WeeklyCalendarDay;
  readonly locale: Locale;
  readonly isToday: boolean;
}

function DayCell({ day, locale, isToday }: DayCellProps) {
  const name = WEEKDAY_NAMES[day.dayIndex] ?? '';
  const initial = WEEKDAY_INITIALS[day.dayIndex] ?? '';

  return (
    <li className={styles.day} aria-current={isToday ? 'date' : undefined}>
      <span className={isToday ? styles.weekdayToday : styles.weekday} aria-hidden="true">
        {initial}
      </span>
      <span className={day.trained ? styles.trained : styles.rest} title={describeDay(day, locale)}>
        <span className={styles.visuallyHidden}>{`${name}: `}</span>
        {dayLabel(day)}
      </span>
    </li>
  );
}

/** La etiqueta visible del día: una palabra o el hueco de un día de descanso. */
function dayLabel(day: WeeklyCalendarDay): string {
  if (!day.trained) return REST_DAY_LABEL;

  return day.bodyPart === null ? UNCLASSIFIED_DAY_LABEL : BODY_PART_LABELS[day.bodyPart];
}

/** El detalle que no cabe en la columna, en el tooltip nativo del navegador. */
function describeDay(day: WeeklyCalendarDay, locale: Locale): string {
  if (!day.trained) return 'Descanso';

  const series = day.setCount === 1 ? '1 serie' : `${String(day.setCount)} series`;

  return `${series} · ${formatVolumeLabel(parseVolumeKilogramsToGrams(day.volume), locale)}`;
}
