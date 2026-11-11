import type {
  Locale,
  ResourceId,
  SetEntry,
  TrackedExercise,
  WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { Link, useParams } from 'react-router';
import { useSessionDetail, useTrackedExercises } from '../../api/queries';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Notice, PlateStack, Surface } from '../../components/index';
import {
  formatDuration,
  formatRpe,
  formatSessionDate,
  formatTime,
  formatVolumeLabel,
  formatSetValueLabel,
} from '../../lib/format';
import { parseResourceId } from '../../lib/ids';
import { durationSecondsBetween } from '../../lib/time';
import { trackedExercisePath } from '../exercises/paths';
import { SESSION_PATH } from '../session/paths';
import { groupSetsByExercise, summarizeSession } from '../session/summary';
import { DeleteSessionPanel } from './DeleteSessionPanel';
import { HISTORY_PATH } from './paths';
import styles from './SessionDetailScreen.module.css';
import { drawsPlates } from '../exercises/equipment';
import { plural, t, useLocale } from '../../i18n/index';

function backToHistory(): BackLink {
  return { to: HISTORY_PATH, label: t('Historial', 'History') };
}

/** El detalle de una sesión pasada (`/history/:id`): qué hiciste aquel día y cuánto. */
export function SessionDetailScreen() {
  const params = useParams();
  // El identificador de la URL se valida antes de consultar nada, igual que en la ficha
  // de un ejercicio: con basura en el enlace la pantalla avisa en vez de ir al Worker.
  const sessionId = parseResourceId(params['id']);

  if (sessionId === null) {
    return (
      <>
        <ScreenHeader title={t('Sesión', 'Session')} backTo={backToHistory()} />
        <Notice tone="danger" title={t('No existe esa sesión', 'That session doesn’t exist')}>
          {t(
            'El enlace no apunta a ninguna de tus sesiones.',
            'The link doesn’t point to any of your sessions.',
          )}
        </Notice>
      </>
    );
  }

  return <SessionDetail sessionId={sessionId} />;
}

interface SessionDetailProps {
  readonly sessionId: ResourceId;
}

function SessionDetail({ sessionId }: SessionDetailProps) {
  const locale = useLocale();
  const detail = useSessionDetail(sessionId);
  // Con los archivados: una sesión de hace meses puede tener series de un ejercicio que
  // ya no se sigue, y sin su nombre la pantalla se llenaría de filas sin encabezado.
  const exercises = useTrackedExercises({ includeArchived: true });
  const startedAt = detail.data?.startedAt;

  return (
    <>
      <ScreenHeader
        title={
          startedAt === undefined ? t('Sesión', 'Session') : formatSessionDate(startedAt, locale)
        }
        backTo={backToHistory()}
      />
      <AsyncContent query={detail}>
        {(workout) => (
          <AsyncContent query={exercises}>
            {(items) => <SessionBody session={workout} exercises={items} locale={locale} />}
          </AsyncContent>
        )}
      </AsyncContent>
    </>
  );
}

interface SessionBodyProps {
  readonly session: WorkoutSessionDetail;
  readonly exercises: readonly TrackedExercise[];
  readonly locale: Locale;
}

function SessionBody({ session, exercises, locale }: SessionBodyProps) {
  const groups = groupSetsByExercise(session.sets, exercises);
  const totals = summarizeSession(session.sets, exercises);
  const endedAt = session.endedAt;
  const duration = endedAt === null ? null : durationSecondsBetween(session.startedAt, endedAt);

  return (
    <div className={styles.stack}>
      {endedAt === null && (
        <Notice title={t('Esta sesión sigue abierta', 'This session is still open')}>
          {t('Lo que registres ahora entra aquí.', 'Whatever you log now goes here.')}{' '}
          <Link to={SESSION_PATH}>
            {t('Ir a la sesión en curso', 'Go to the session in progress')}
          </Link>
        </Notice>
      )}

      <Surface as="section" className={styles.summary}>
        <Metric
          label={t('Horario', 'Time')}
          value={
            endedAt === null
              ? formatTime(session.startedAt, locale)
              : `${formatTime(session.startedAt, locale)} – ${formatTime(endedAt, locale)}`
          }
        />
        {duration !== null && (
          <Metric label={t('Duración', 'Duration')} value={formatDuration(duration)} />
        )}
        <Metric
          label={t('Series', 'Sets')}
          value={plural(totals.workingSetCount, ['serie', 'series'], ['set', 'sets'])}
        />
        <Metric
          label={t('Ejercicios', 'Exercises')}
          value={plural(
            totals.exerciseCount,
            ['ejercicio', 'ejercicios'],
            ['exercise', 'exercises'],
          )}
        />
        <Metric
          label={t('Volumen', 'Volume')}
          value={formatVolumeLabel(totals.volumeGrams, locale)}
        />
      </Surface>

      {session.notes !== null && (
        <Surface as="section">
          <p className={styles.sectionLabel}>{t('Notas', 'Notes')}</p>
          <p className={styles.notes}>{session.notes}</p>
        </Surface>
      )}

      {groups.length === 0 ? (
        <Notice title={t('Esta sesión no tiene ninguna serie', 'This session has no sets')}>
          {t(
            'Se abrió y se cerró sin registrar nada.',
            'It was opened and closed without logging anything.',
          )}
        </Notice>
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => (
            <Surface as="section" key={group.trackedExerciseId} className={styles.group}>
              <Link to={trackedExercisePath(group.trackedExerciseId)} className={styles.groupTitle}>
                {group.name}
              </Link>
              <ol className={styles.sets}>
                {group.sets.map((set, index) => (
                  <SetRow
                    key={set.id}
                    set={set}
                    plates={drawsPlates(group)}
                    unilateral={group.unilateral}
                    position={index + 1}
                    locale={locale}
                  />
                ))}
              </ol>
            </Surface>
          ))}
        </div>
      )}

      {/* La abierta no se borra desde aquí: puede tener series en la cola de otro móvil o de este. */}
      {endedAt !== null && (
        <DeleteSessionPanel sessionId={session.id} workingSetCount={totals.workingSetCount} />
      )}
    </div>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  );
}

interface SetRowProps {
  readonly set: SetEntry;
  readonly plates: boolean;
  readonly unilateral: boolean;
  readonly position: number;
  readonly locale: Locale;
}

/** Una serie ya cerrada: se lee, no se toca. Corregirla solo se puede con la sesión abierta. */
function SetRow({ set, plates, unilateral, position, locale }: SetRowProps) {
  return (
    <li className={styles.set}>
      <span className={styles.setPosition}>{position}</span>
      {plates && set.kind === 'strength' && <PlateStack weight={set.weight} locale={locale} />}
      <span className={styles.setValue}>{formatSetValueLabel(set, locale, unilateral)}</span>
      <span className={styles.setMeta}>
        {set.isWarmup && <Badge>{t('Calentamiento', 'Warm-up')}</Badge>}
        {set.rpe !== null && <span>{formatRpe(set.rpe, locale)}</span>}
      </span>
    </li>
  );
}
