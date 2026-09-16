import {
  parseVolumeKilogramsToGrams,
  type Locale,
  type WeeklyCalendar,
  type WeeklyCalendarDay,
} from '@gymbuddy/shared';
import { useState } from 'react';
import { useWeeklyCalendar } from '../../api/queries';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Surface } from '../../components/index';
import { cx } from '../../lib/cx';
import { formatVolumeLabel, pluralize } from '../../lib/format';
import { BodyMap } from './BodyMap';
import { bodyPartBreakdown, bodyPartNames } from './body-map';
import styles from './WeekCalendar.module.css';
import { UNCLASSIFIED_DAY_LABEL, WEEKDAY_INITIALS, WEEKDAY_NAMES } from './labels';

export interface WeekCalendarProps {
  readonly locale: Locale;
}

/**
 * La semana en curso de un vistazo: cada día entrenado lleva una silueta con todas las partes del
 * cuerpo que trabajó, más oscuras cuanto más series tuvieron (opción B de la maqueta, elegida por
 * Juan el 2026-09-16), sin texto que recortar en una columna de un séptimo del ancho. Lo que fue
 * cada parte sale debajo, del día que se toque o de hoy.
 */
export function WeekCalendar({ locale }: WeekCalendarProps) {
  const week = useWeeklyCalendar();

  return (
    <Surface as="section" aria-label="Esta semana">
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
  const [selected, setSelected] = useState(today);
  const selectedDay = week.days.find((day) => day.date === selected) ?? week.days[0];

  return (
    <>
      <ol className={styles.week}>
        {week.days.map((day) => (
          <DayCell
            key={day.date}
            day={day}
            isToday={day.date === today}
            isSelected={day.date === selectedDay?.date}
            onSelect={() => {
              setSelected(day.date);
            }}
          />
        ))}
      </ol>
      {selectedDay !== undefined && (
        <p className={styles.detail} aria-live="polite">
          <span className={styles.detailDay}>
            {selectedDay.date === today ? 'Hoy' : (WEEKDAY_NAMES[selectedDay.dayIndex] ?? '')}
          </span>{' '}
          · {describeDay(selectedDay, locale)}
        </p>
      )}
    </>
  );
}

interface DayCellProps {
  readonly day: WeeklyCalendarDay;
  readonly isToday: boolean;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}

function DayCell({ day, isToday, isSelected, onSelect }: DayCellProps) {
  const name = WEEKDAY_NAMES[day.dayIndex] ?? '';
  const initial = WEEKDAY_INITIALS[day.dayIndex] ?? '';

  return (
    <li className={styles.day} aria-current={isToday ? 'date' : undefined}>
      <button
        type="button"
        className={cx(
          styles.mark,
          day.trained && styles.markTrained,
          isToday && styles.markToday,
          isSelected && styles.markSelected,
        )}
        aria-pressed={isSelected}
        aria-label={`${name}: ${dayLabel(day)}`}
        onClick={onSelect}
      >
        {day.trained ? (
          <BodyMap loads={day.bodyParts} className={styles.figure} />
        ) : (
          <span className={styles.restDash} aria-hidden="true" />
        )}
      </button>
      <span className={isToday ? styles.weekdayToday : styles.weekday} aria-hidden="true">
        {initial}
      </span>
    </li>
  );
}

/** Las partes entrenadas, o que fue descanso. */
function dayLabel(day: WeeklyCalendarDay): string {
  if (!day.trained) return 'descanso';

  return day.bodyParts.length === 0 ? UNCLASSIFIED_DAY_LABEL : bodyPartNames(day.bodyParts);
}

/**
 * El detalle del día elegido, entero: aquí sí hay ancho para las series de cada parte —lo que la
 * silueta dice con lo oscuro—, el total y el volumen.
 */
export function describeDay(day: WeeklyCalendarDay, locale: Locale): string {
  if (!day.trained) return 'Descanso';

  const parts =
    day.bodyParts.length === 0 ? UNCLASSIFIED_DAY_LABEL : bodyPartBreakdown(day.bodyParts);
  const volume = formatVolumeLabel(parseVolumeKilogramsToGrams(day.volume), locale);

  // Con una sola parte clasificada y nada más, su cuenta ya es el total: no se repite.
  const onlyPart = day.bodyParts.length === 1 && day.bodyParts[0]?.setCount === day.setCount;
  const total = onlyPart ? '' : ` · ${pluralize(day.setCount, 'serie', 'series')}`;

  return `${parts}${total} · ${volume}`;
}
