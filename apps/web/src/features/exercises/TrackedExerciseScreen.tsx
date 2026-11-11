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
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Button, Notice, Surface, Switch } from '../../components/index';
import { describeError } from '../../lib/errors';
import {
  formatExerciseWeightLabel,
  formatRecordValueLabel,
  formatRpe,
  formatSessionDate,
  formatSetValueLabel,
  formatTime,
  formatWeightLabel,
} from '../../lib/format';
import { parseResourceId } from '../../lib/ids';
import { ExerciseGif } from '../catalog/ExerciseGif';
import { bodyPartLabel, muscleLabel } from '../catalog/labels';
import { catalogExercisePath, catalogExerciseRef } from '../catalog/paths';
import { sessionPathForExercise } from '../session/paths';
import { offersUnilateral } from './custom-exercise';
import { EditExerciseSheet } from './EditExerciseSheet';
import { ExerciseMediaSection } from './ExerciseMediaSection';
import { originLabel, recordLabel, RECORD_ORDER, unilateralHint } from './labels';
import { EXERCISES_PATH } from './paths';
import { ProgressionChart } from './ProgressionChart';
import styles from './TrackedExerciseScreen.module.css';
import { plural, t, useLocale } from '../../i18n/index';

function backToExercises(): BackLink {
  return { to: EXERCISES_PATH, label: t('Mis ejercicios', 'My exercises') };
}

/** La ficha de un ejercicio seguido (`/exercises/:id`): cómo va, qué hiciste y su edición. */
export function TrackedExerciseScreen() {
  const params = useParams();
  const exerciseId = parseResourceId(params['id']);

  if (exerciseId === null) {
    return (
      <>
        <ScreenHeader title={t('Ejercicio', 'Exercise')} backTo={backToExercises()} />
        <Notice tone="danger" title={t('No existe ese ejercicio', 'That exercise doesn’t exist')}>
          {t(
            'El enlace no apunta a ninguno de tus ejercicios.',
            'The link doesn’t point to any of your exercises.',
          )}
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
  const locale = useLocale();
  const exercises = useTrackedExercises({ includeArchived: true });
  const stats = useExerciseStats(exerciseId);
  const history = useExerciseHistory(exerciseId);
  const [editing, setEditing] = useState(false);

  const exercise = exercises.data?.find((item) => item.id === exerciseId) ?? null;

  return (
    <>
      <ScreenHeader
        title={exercise?.name ?? t('Ejercicio', 'Exercise')}
        subtitle={exercise === null ? undefined : catalogNameSubtitle(exercise)}
        backTo={backToExercises()}
        action={
          exercise !== null ? (
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(true);
              }}
            >
              {t('Editar', 'Edit')}
            </Button>
          ) : undefined
        }
      />
      <AsyncContent query={exercises}>
        {(items) => {
          const found = items.find((item) => item.id === exerciseId);
          if (found === undefined) {
            return (
              <Notice
                tone="danger"
                title={t('No existe ese ejercicio', 'That exercise doesn’t exist')}
              >
                {t(
                  'No está entre los ejercicios que sigues.',
                  'It isn’t among the exercises you track.',
                )}
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
                    alt={t(`Animación de ${found.name}`, `Animation of ${found.name}`)}
                  />
                )}

                <ExerciseTags exercise={found} />

                {found.origin === 'custom' && <ExerciseMediaSection exercise={found} />}

                {/* Uno marcado se enseña siempre, para poder desmarcarlo aunque ahora sea de cardio. */}
                {(offersUnilateral(found.bodyPart) || found.unilateral) && (
                  <UnilateralSetting exercise={found} />
                )}

                {found.archivedAt === null && (
                  <Link to={sessionPathForExercise(found.id)} className={styles.logLink}>
                    {t('Registrar una serie', 'Log a set')}
                  </Link>
                )}

                <AsyncContent query={stats}>
                  {(data) => (
                    <StatsSection stats={data} unilateral={found.unilateral} locale={locale} />
                  )}
                </AsyncContent>

                {found.notes !== null && (
                  <Surface as="section">
                    <h2 className={styles.sectionTitle}>{t('Notas', 'Notes')}</h2>
                    <p className={styles.notes}>{found.notes}</p>
                  </Surface>
                )}

                <AsyncContent query={history}>
                  {(data) => (
                    <HistorySection history={data} unilateral={found.unilateral} locale={locale} />
                  )}
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
      title={t('Ejercicio archivado', 'Archived exercise')}
      action={
        <Button
          variant="secondary"
          loading={update.isPending}
          onClick={() => {
            update.mutate({ exerciseId: exercise.id, body: { archived: false } });
          }}
        >
          {t('Recuperar', 'Restore')}
        </Button>
      }
    >
      {update.isError
        ? describeError(update.error)
        : t(
            'No aparece en tu lista ni en la sesión. Su historial y sus marcas siguen aquí.',
            'It doesn’t appear in your list or in sessions. Its history and records are still here.',
          )}
    </Notice>
  );
}

/**
 * Uno del catálogo con nombre propio sigue diciendo cómo se llama allí: es con ese nombre con el
 * que se busca en el catálogo y con el que lo conoce cualquier otra persona.
 */
function catalogNameSubtitle({ name, catalogName }: TrackedExercise): string | undefined {
  return catalogName !== null && catalogName !== name
    ? t(`En el catálogo: ${catalogName}`, `In the catalogue: ${catalogName}`)
    : undefined;
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
      <ul className={styles.tags} aria-label={t('Características', 'Details')}>
        {exercise.bodyPart !== null && (
          <li>
            <Badge tone="accent">{bodyPartLabel(exercise.bodyPart)}</Badge>
          </li>
        )}
        {exercise.muscle !== null && (
          <li>
            <Badge>{muscleLabel(exercise.muscle)}</Badge>
          </li>
        )}
        <li>
          <Badge>{originLabel(exercise.origin)}</Badge>
        </li>
      </ul>
      {catalogLink !== null && (
        <Link to={catalogLink} className={styles.catalogLink}>
          {t('Ver en el catálogo', 'View in the catalogue')}
        </Link>
      )}
    </div>
  );
}

/**
 * «A un brazo» se marca aquí, en la ficha, y no al registrar (lo decidió Juan): es del ejercicio y
 * no de cada serie. Va directo al Worker, fuera de la cola offline, igual que archivar: cambiarlo
 * reescala las marcas de volumen guardadas, y eso no se puede adelantar en el móvil.
 */
function UnilateralSetting({ exercise }: ExerciseProps) {
  const update = useUpdateTrackedExercise();
  // Mientras se guarda se enseña lo pedido: la lista no cambia hasta que el Worker contesta.
  const checked = update.isPending
    ? (update.variables.body.unilateral ?? exercise.unilateral)
    : exercise.unilateral;

  return (
    <Surface as="section" padding="md">
      <Switch
        label={t('A un brazo', 'One arm')}
        checked={checked}
        disabled={update.isPending}
        onChange={(unilateral) => {
          update.mutate({ exerciseId: exercise.id, body: { unilateral } });
        }}
        hint={unilateralHint()}
      />
      {update.isError && (
        <Notice tone="danger" title={t('No se pudo cambiar', 'Couldn’t change it')}>
          {describeError(update.error)}
        </Notice>
      )}
    </Surface>
  );
}

interface StatsSectionProps {
  readonly stats: ExerciseStats;
  readonly unilateral: boolean;
  readonly locale: Locale;
}

/**
 * Peso habitual, marcas vigentes y aviso de estancamiento. Sin series todavía no hay
 * nada que decir aquí: el historial, más abajo, es quien explica qué va a aparecer.
 */
function StatsSection({ stats, unilateral, locale }: StatsSectionProps) {
  if (stats.workingWeight === null) return null;

  const records = RECORD_ORDER.flatMap((kind) =>
    stats.records.filter((record) => record.kind === kind),
  );

  return (
    <>
      <Surface as="section" className={styles.working}>
        <p className={styles.sectionLabel}>{t('Peso habitual', 'Usual weight')}</p>
        <p className={styles.workingValue}>
          {formatExerciseWeightLabel(stats.workingWeight.weight, locale, unilateral)}{' '}
          <span className={styles.workingReps}>× {stats.workingWeight.reps}</span>
        </p>
        <p className={styles.workingMeta}>
          {stats.workingWeight.sessionCount === 1
            ? t(
                'Una sola sesión: todavía es solo un dato',
                'A single session: still just one data point',
              )
            : t(
                `Mediana de tus últimas ${plural(stats.workingWeight.sessionCount, ['sesión', 'sesiones'], ['session', 'sessions'])}`,
                `Median of your last ${plural(stats.workingWeight.sessionCount, ['sesión', 'sesiones'], ['session', 'sessions'])}`,
              )}
          {t(' · última vez ', ' · last time ')}
          {formatSessionDate(stats.workingWeight.lastPerformedAt, locale)}
        </p>
      </Surface>

      {stats.stalled !== null && (
        <Notice
          tone="warning"
          title={t(
            `Estancado en ${formatExerciseWeightLabel(stats.stalled.weight, locale, unilateral)}`,
            `Stalled at ${formatExerciseWeightLabel(stats.stalled.weight, locale, unilateral)}`,
          )}
        >
          {t(
            `Llevas ${plural(stats.stalled.sessions, ['sesión', 'sesiones'], ['session', 'sessions'])} con el mismo peso sin perder repeticiones. Prueba con ${formatWeightLabel(stats.stalled.suggestedIncrement, locale)} más.`,
            `You’ve done ${plural(stats.stalled.sessions, ['sesión', 'sesiones'], ['session', 'sessions'])} at the same weight without losing reps. Try ${formatWeightLabel(stats.stalled.suggestedIncrement, locale)} more.`,
          )}
        </Notice>
      )}

      <ProgressionChart
        points={stats.points}
        records={stats.records}
        unilateral={unilateral}
        locale={locale}
      />

      {records.length > 0 && (
        <Surface as="section">
          <h2 className={styles.sectionTitle}>{t('Marcas', 'Records')}</h2>
          <ul className={styles.records} aria-label={t('Marcas', 'Records')}>
            {records.map((record) => (
              <li key={record.id} className={styles.record}>
                <span className={styles.recordLabel}>{recordLabel(record.kind)}</span>
                <span className={styles.recordValue}>
                  {formatRecordValueLabel(record, locale, unilateral)}
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
  readonly unilateral: boolean;
  readonly locale: Locale;
}

function HistorySection({ history, unilateral, locale }: HistorySectionProps) {
  if (history.sessions.length === 0) {
    return (
      <Notice
        title={t('Todavía no has registrado ninguna serie', 'You haven’t logged any sets yet')}
      >
        {t(
          'Cuando la registres, aquí verás tu peso habitual, tus marcas y las últimas sesiones.',
          'Once you do, you’ll see your usual weight, your records and your latest sessions here.',
        )}
      </Notice>
    );
  }

  return (
    <section className={styles.history}>
      <h2 className={styles.sectionTitle}>{t('Últimas sesiones', 'Latest sessions')}</h2>
      <ul className={styles.sessions}>
        {history.sessions.map((entry) => (
          <HistoryEntry
            key={entry.sessionId}
            entry={entry}
            unilateral={unilateral}
            locale={locale}
          />
        ))}
      </ul>
    </section>
  );
}

interface HistoryEntryProps {
  readonly entry: ExerciseHistoryEntry;
  readonly unilateral: boolean;
  readonly locale: Locale;
}

function HistoryEntry({ entry, unilateral, locale }: HistoryEntryProps) {
  return (
    <Surface as="li" className={styles.session}>
      <p className={styles.sessionDate}>
        {formatSessionDate(entry.startedAt, locale)}
        <span className={styles.sessionTime}> · {formatTime(entry.startedAt, locale)}</span>
      </p>
      <ul className={styles.sets}>
        {entry.sets.map((set) => (
          <SetRow key={set.id} set={set} unilateral={unilateral} locale={locale} />
        ))}
      </ul>
    </Surface>
  );
}

interface SetRowProps {
  readonly set: SetEntry;
  readonly unilateral: boolean;
  readonly locale: Locale;
}

function SetRow({ set, unilateral, locale }: SetRowProps) {
  return (
    <li className={styles.set}>
      <span className={styles.setValue}>{formatSetValueLabel(set, locale, unilateral)}</span>
      <span className={styles.setMeta}>
        {set.isWarmup && <Badge>{t('Calentamiento', 'Warm-up')}</Badge>}
        {set.rpe !== null && <span>{formatRpe(set.rpe, locale)}</span>}
      </span>
    </li>
  );
}
