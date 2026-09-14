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
import { BODY_PART_LABELS } from '../catalog/labels';
import { BodyPartIcon } from './body-part-icons';
import styles from './WeekCalendar.module.css';
import { UNCLASSIFIED_DAY_LABEL, WEEKDAY_INITIALS, WEEKDAY_NAMES } from './labels';

export interface WeekCalendarProps {
  readonly locale: Locale;
}

/**
 * La semana en curso de un vistazo (opción B que eligió Juan el 2026-09-14): cada día entrenado
 * lleva el dibujo de la parte del cuerpo con más volumen, sin texto que recortar en una columna de
 * un séptimo del ancho. El nombre entero sale debajo, del día que se toque o de hoy.
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
          <BodyPartIcon bodyPart={day.bodyPart} className={styles.icon} />
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

/** El nombre de lo entrenado, o que fue descanso. */
function dayLabel(day: WeeklyCalendarDay): string {
  if (!day.trained) return 'descanso';

  return day.bodyPart === null ? UNCLASSIFIED_DAY_LABEL : BODY_PART_LABELS[day.bodyPart];
}

/** El detalle del día elegido, entero: aquí sí hay ancho para el nombre, las series y el volumen. */
export function describeDay(day: WeeklyCalendarDay, locale: Locale): string {
  if (!day.trained) return 'Descanso';

  const series = pluralize(day.setCount, 'serie', 'series');
  const volume = formatVolumeLabel(parseVolumeKilogramsToGrams(day.volume), locale);

  return `${dayLabel(day)} · ${series} · ${volume}`;
}
