import type { BodyPart, Locale, ResourceId, SetEntry, TrackedExercise } from '@gymbuddy/shared';
import { useId, useState } from 'react';
import { Badge, Notice, SearchField } from '../../components/index';
import { cx } from '../../lib/cx';
import { BODY_PART_LABELS } from '../catalog/labels';
import {
  exercisePickerSections,
  NO_PICKER_FILTER,
  pickerBodyParts,
  pickerRowDetail,
  type ExercisePickerFilter,
  type ExercisePickerRow,
} from './exercise-picker';
import { ExerciseMedia } from './ExerciseMedia';
import type { RoutineProgress } from './routine-progress';
import styles from './ExercisePicker.module.css';

export interface ExercisePickerProps {
  readonly exercises: readonly TrackedExercise[];
  readonly selected: TrackedExercise;
  readonly routineProgress: RoutineProgress | null;
  readonly sessionSets: readonly SetEntry[];
  readonly locale: Locale;
  readonly onPick: (exerciseId: ResourceId) => void;
  /** Volver al registro sin cambiar nada. */
  readonly onBack: () => void;
}

/**
 * La lista para elegir el ejercicio de una serie (opción A de la maqueta, elegida por Juan el
 * 2026-09-16). Vive dentro de la hoja de registrar y no en una segunda hoja: dos `<dialog>` modales
 * apilados pelean por el foco, y así lo tecleado en el formulario sigue ahí al volver.
 */
export function ExercisePicker({
  exercises,
  selected,
  routineProgress,
  sessionSets,
  locale,
  onPick,
  onBack,
}: ExercisePickerProps) {
  const [filter, setFilter] = useState<ExercisePickerFilter>(NO_PICKER_FILTER);
  const headingId = useId();
  const bodyParts = pickerBodyParts(exercises);
  const sections = exercisePickerSections(exercises, { routineProgress, selected, filter });

  const chooseBodyPart = (bodyPart: BodyPart | null): void => {
    setFilter((current) => ({ ...current, bodyPart }));
  };

  return (
    <section className={styles.picker} aria-labelledby={headingId}>
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack}>
          ‹ Volver
        </button>
        <h3 id={headingId} className={styles.heading}>
          Elegir ejercicio
        </h3>
      </div>

      <SearchField
        label="Buscar en tus ejercicios"
        value={filter.text}
        onChange={(text) => {
          setFilter((current) => ({ ...current, text }));
        }}
      />

      {bodyParts.length > 1 && (
        <div className={styles.chips} role="group" aria-label="Parte del cuerpo">
          <Chip
            label="Todos"
            pressed={filter.bodyPart === null}
            onPress={() => chooseBodyPart(null)}
          />
          {bodyParts.map((bodyPart) => (
            <Chip
              key={bodyPart}
              label={BODY_PART_LABELS[bodyPart]}
              pressed={filter.bodyPart === bodyPart}
              onPress={() => chooseBodyPart(bodyPart)}
            />
          ))}
        </div>
      )}

      {sections.length === 0 ? (
        <Notice title="Ningún ejercicio coincide">
          Prueba con otra palabra o quita el filtro de parte del cuerpo.
        </Notice>
      ) : (
        sections.map((section) => (
          <PickerSection
            key={section.key}
            title={section.title}
            rows={section.rows}
            selectedId={selected.id}
            sessionSets={sessionSets}
            locale={locale}
            onPick={onPick}
          />
        ))
      )}
    </section>
  );
}

interface ChipProps {
  readonly label: string;
  readonly pressed: boolean;
  readonly onPress: () => void;
}

function Chip({ label, pressed, onPress }: ChipProps) {
  return (
    <button
      type="button"
      className={cx(styles.chip, pressed && styles.chipPressed)}
      aria-pressed={pressed}
      onClick={onPress}
    >
      {label}
    </button>
  );
}

interface PickerSectionProps {
  readonly title: string;
  readonly rows: readonly ExercisePickerRow[];
  readonly selectedId: ResourceId;
  readonly sessionSets: readonly SetEntry[];
  readonly locale: Locale;
  readonly onPick: (exerciseId: ResourceId) => void;
}

function PickerSection({
  title,
  rows,
  selectedId,
  sessionSets,
  locale,
  onPick,
}: PickerSectionProps) {
  const titleId = useId();

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h4 id={titleId} className={styles.sectionTitle}>
        {title}
      </h4>
      <ul className={styles.rows}>
        {rows.map((row) => (
          <li key={row.exercise.id}>
            <PickerRow
              row={row}
              selected={row.exercise.id === selectedId}
              detail={pickerRowDetail(row.exercise, sessionSets, locale)}
              onPick={onPick}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

interface PickerRowProps {
  readonly row: ExercisePickerRow;
  readonly selected: boolean;
  readonly detail: string;
  readonly onPick: (exerciseId: ResourceId) => void;
}

function PickerRow({ row, selected, detail, onPick }: PickerRowProps) {
  const detailId = useId();
  const { exercise, status } = row;

  return (
    <button
      type="button"
      className={cx(styles.row, selected && styles.rowSelected)}
      // El nombre solo: la fila se anuncia y se busca por el ejercicio, y el detalle va aparte.
      aria-label={exercise.name}
      aria-describedby={detailId}
      aria-pressed={selected}
      onClick={() => {
        onPick(exercise.id);
      }}
    >
      <ExerciseMedia exercise={exercise} />
      <span className={styles.text}>
        <span className={styles.name}>{exercise.name}</span>
        <span id={detailId} className={styles.detail}>
          {detail}
        </span>
      </span>
      {status === 'current' && <Badge tone="accent">Toca</Badge>}
      {status === 'done' && <Badge tone="success">Hecho</Badge>}
    </button>
  );
}
