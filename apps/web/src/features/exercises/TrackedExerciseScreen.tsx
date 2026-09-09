import type {
  ExerciseHistory,
  ExerciseHistoryEntry,
  ExerciseStats,
  Locale,
  ResourceId,
  SetEntry,
  TrackedExercise,
} from '@gymbuddy/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useUpdateTrackedExercise } from '../../api/mutations';
import { useExerciseHistory, useExerciseStats, useTrackedExercises } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Button, Notice, Surface } from '../../components/index';
import { describeError } from '../../lib/errors';
import {
  formatRpe,
  formatSessionDate,
  formatTime,
  formatWeightLabel,
  pluralize,
} from '../../lib/format';
import { ExerciseGif } from '../catalog/ExerciseGif';
import { BODY_PART_LABELS, MUSCLE_LABELS } from '../catalog/labels';
import { catalogExercisePath, catalogExerciseRef } from '../catalog/paths';
import { sessionPathForExercise } from '../session/paths';
import { EditExerciseSheet } from './EditExerciseSheet';
import { ORIGIN_LABELS, RECORD_LABELS, RECORD_ORDER } from './labels';
import { EXERCISES_PATH, parseResourceId } from './paths';
import styles from './TrackedExerciseScreen.module.css';

const BACK_TO_EXERCISES: BackLink = { to: EXERCISES_PATH, label: 'Mis ejercicios' };

/** La ficha de un ejercicio seguido (`/exercises/:id`): cómo va, qué hiciste y su edición. */
export function TrackedExerciseScreen() {
  const params = useParams();
  const exerciseId = parseResourceId(params['id']);

  if (exerciseId === null) {
    return (
      <>
        <ScreenHeader title="Ejercicio" backTo={BACK_TO_EXERCISES} />
        <Notice tone="danger" title="No existe ese ejercicio">
          El enlace no apunta a ninguno de tus ejercicios.
        </Notice>
      </>
    );
  }

  return <TrackedExerciseDetail exerciseId={exerciseId} />;
}

interface TrackedExerciseDetailProps {
  readonly exerciseId: ResourceId;
}

/**
 * La ficha del ejercicio sale del listado (no hay `GET /exercises/{id}`: el listado ya
 * trae todo lo que la ficha muestra), y se pide con los archivados para que la ficha de
 * uno archivado siga abriéndose y se pueda recuperar desde ella.
 */
function TrackedExerciseDetail({ exerciseId }: TrackedExerciseDetailProps) {
  const { session } = useSession();
  const locale = session?.user.locale ?? 'es';
  const exercises = useTrackedExercises({ includeArchived: true });
  const stats = useExerciseStats(exerciseId);
  const history = useExerciseHistory(exerciseId);
  const [editing, setEditing] = useState(false);

  const exercise = exercises.data?.find((item) => item.id === exerciseId) ?? null;

  return (
    <>
      <ScreenHeader
        title={exercise?.name ?? 'Ejercicio'}
        backTo={BACK_TO_EXERCISES}
        action={
          exercise !== null ? (
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(true);
              }}
            >
              Editar
            </Button>
          ) : undefined
        }
      />
      <AsyncContent query={exercises}>
        {(items) => {
          const found = items.find((item) => item.id === exerciseId);
          if (found === undefined) {
            return (
              <Notice tone="danger" title="No existe ese ejercicio">
                No está entre los ejercicios que sigues.
              </Notice>
            );
          }

          return (
            <>
              <div className={styles.stack}>
                {found.archivedAt !== null && <ArchivedNotice exercise={found} />}

                {found.gifUrl !== null && (
                  <ExerciseGif
                    key={found.gifUrl}
                    src={found.gifUrl}
                    alt={`Animación de ${found.name}`}
                  />
                )}

                <ExerciseTags exercise={found} />

                {found.archivedAt === null && (
                  <Link to={sessionPathForExercise(found.id)} className={styles.logLink}>
                    Registrar una serie
                  </Link>
                )}

                <AsyncContent query={stats}>
                  {(data) => <StatsSection stats={data} locale={locale} />}
                </AsyncContent>

                {found.notes !== null && (
                  <Surface as="section">
                    <h2 className={styles.sectionTitle}>Notas</h2>
                    <p className={styles.notes}>{found.notes}</p>
                  </Surface>
                )}

                <AsyncContent query={history}>
                  {(data) => <HistorySection history={data} locale={locale} />}
                </AsyncContent>
              </div>

              <EditExerciseSheet
                exercise={found}
                open={editing}
                onClose={() => {
                  setEditing(false);
                }}
              />
            </>
          );
        }}
      </AsyncContent>
    </>
  );
}

interface ExerciseProps {
  readonly exercise: TrackedExercise;
}

/** Un archivado se abre igual, pero se dice, y se recupera de un toque sin pasar por la hoja. */
function ArchivedNotice({ exercise }: ExerciseProps) {
  const update = useUpdateTrackedExercise();

  return (
    <Notice
      tone="warning"
      title="Ejercicio archivado"
      action={
        <Button
          variant="secondary"
          loading={update.isPending}
          onClick={() => {
            update.mutate({ exerciseId: exercise.id, body: { archived: false } });
          }}
        >
          Recuperar
        </Button>
      }
    >
      {update.isError
        ? describeError(update.error)
        : 'No aparece en tu lista ni en la sesión. Su historial y sus marcas siguen aquí.'}
    </Notice>
  );
}

function ExerciseTags({ exercise }: ExerciseProps) {
  const catalogLink =
    exercise.origin === 'catalog' && exercise.catalogId !== null && exercise.muscle !== null
      ? catalogExercisePath(
          catalogExerciseRef({ catalogId: exercise.catalogId, muscle: exercise.muscle }),
        )
      : null;

  return (
    <div className={styles.tagsRow}>
      <ul className={styles.tags} aria-label="Características">
        {exercise.bodyPart !== null && (
          <li>
            <Badge tone="accent">{BODY_PART_LABELS[exercise.bodyPart]}</Badge>
          </li>
        )}
        {exercise.muscle !== null && (
          <li>
            <Badge>{MUSCLE_LABELS[exercise.muscle]}</Badge>
          </li>
        )}
        <li>
          <Badge>{ORIGIN_LABELS[exercise.origin]}</Badge>
        </li>
      </ul>
      {catalogLink !== null && (
        <Link to={catalogLink} className={styles.catalogLink}>
          Ver en el catálogo
        </Link>
      )}
    </div>
  );
}

interface StatsSectionProps {
  readonly stats: ExerciseStats;
  readonly locale: Locale;
}

/**
 * Peso habitual, marcas vigentes y aviso de estancamiento. Sin series todavía no hay
 * nada que decir aquí: el historial, más abajo, es quien explica qué va a aparecer.
 */
function StatsSection({ stats, locale }: StatsSectionProps) {
  if (stats.workingWeight === null) return null;

  const records = RECORD_ORDER.flatMap((kind) =>
    stats.records.filter((record) => record.kind === kind),
  );

  return (
    <>
      <Surface as="section" className={styles.working}>
        <p className={styles.sectionLabel}>Peso habitual</p>
        <p className={styles.workingValue}>
          {formatWeightLabel(stats.workingWeight.weight, locale)}{' '}
          <span className={styles.workingReps}>× {stats.workingWeight.reps}</span>
        </p>
        <p className={styles.workingMeta}>
          {stats.workingWeight.sessionCount === 1
            ? 'Una sola sesión: todavía es solo un dato'
            : `Mediana de tus últimas ${pluralize(stats.workingWeight.sessionCount, 'sesión', 'sesiones')}`}
          {' · última vez '}
          {formatSessionDate(stats.workingWeight.lastPerformedAt, locale)}
        </p>
      </Surface>

      {stats.stalled !== null && (
        <Notice
          tone="warning"
          title={`Estancado en ${formatWeightLabel(stats.stalled.weight, locale)}`}
        >
          Llevas {pluralize(stats.stalled.sessions, 'sesión', 'sesiones')} con el mismo peso sin
          perder repeticiones. Prueba con{' '}
          {formatWeightLabel(stats.stalled.suggestedIncrement, locale)} más.
        </Notice>
      )}

      {records.length > 0 && (
        <Surface as="section">
          <h2 className={styles.sectionTitle}>Marcas</h2>
          <ul className={styles.records}>
            {records.map((record) => (
              <li key={record.id} className={styles.record}>
                <span className={styles.recordLabel}>{RECORD_LABELS[record.kind]}</span>
                <span className={styles.recordValue}>
                  {formatWeightLabel(record.value, locale)}
                </span>
                <span className={styles.recordDate}>
                  {formatSessionDate(record.achievedAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </>
  );
}

interface HistorySectionProps {
  readonly history: ExerciseHistory;
  readonly locale: Locale;
}

function HistorySection({ history, locale }: HistorySectionProps) {
  if (history.sessions.length === 0) {
    return (
      <Notice title="Todavía no has registrado ninguna serie">
        Cuando la registres, aquí verás tu peso habitual, tus marcas y las últimas sesiones.
      </Notice>
    );
  }

  return (
    <section className={styles.history}>
      <h2 className={styles.sectionTitle}>Últimas sesiones</h2>
      <ul className={styles.sessions}>
        {history.sessions.map((entry) => (
          <HistoryEntry key={entry.sessionId} entry={entry} locale={locale} />
        ))}
      </ul>
    </section>
  );
}

interface HistoryEntryProps {
  readonly entry: ExerciseHistoryEntry;
  readonly locale: Locale;
}

function HistoryEntry({ entry, locale }: HistoryEntryProps) {
  return (
    <Surface as="li" className={styles.session}>
      <p className={styles.sessionDate}>
        {formatSessionDate(entry.startedAt, locale)}
        <span className={styles.sessionTime}> · {formatTime(entry.startedAt, locale)}</span>
      </p>
      <ul className={styles.sets}>
        {entry.sets.map((set) => (
          <SetRow key={set.id} set={set} locale={locale} />
        ))}
      </ul>
    </Surface>
  );
}

interface SetRowProps {
  readonly set: SetEntry;
  readonly locale: Locale;
}

function SetRow({ set, locale }: SetRowProps) {
  return (
    <li className={styles.set}>
      <span className={styles.setValue}>
        {formatWeightLabel(set.weight, locale)} × {set.reps}
      </span>
      <span className={styles.setMeta}>
        {set.isWarmup && <Badge>Calentamiento</Badge>}
        {set.rpe !== null && <span>{formatRpe(set.rpe, locale)}</span>}
      </span>
    </li>
  );
}
