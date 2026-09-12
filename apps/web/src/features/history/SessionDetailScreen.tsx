import type {
  Locale,
  ResourceId,
  SetEntry,
  TrackedExercise,
  WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { Link, useParams } from 'react-router';
import { useSessionDetail, useTrackedExercises } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Notice, Surface } from '../../components/index';
import {
  formatDuration,
  formatRpe,
  formatSessionDate,
  formatTime,
  formatVolumeLabel,
  formatWeightLabel,
  pluralize,
} from '../../lib/format';
import { parseResourceId } from '../../lib/ids';
import { durationSecondsBetween } from '../../lib/time';
import { trackedExercisePath } from '../exercises/paths';
import { SESSION_PATH } from '../session/paths';
import { groupSetsByExercise, summarizeSession } from '../session/summary';
import { HISTORY_PATH } from './paths';
import styles from './SessionDetailScreen.module.css';

const BACK_TO_HISTORY: BackLink = { to: HISTORY_PATH, label: 'Historial' };

/** El detalle de una sesión pasada (`/history/:id`): qué hiciste aquel día y cuánto. */
export function SessionDetailScreen() {
  const params = useParams();
  // El identificador de la URL se valida antes de consultar nada, igual que en la ficha
  // de un ejercicio: con basura en el enlace la pantalla avisa en vez de ir al Worker.
  const sessionId = parseResourceId(params['id']);

  if (sessionId === null) {
    return (
      <>
        <ScreenHeader title="Sesión" backTo={BACK_TO_HISTORY} />
        <Notice tone="danger" title="No existe esa sesión">
          El enlace no apunta a ninguna de tus sesiones.
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
  const { session: authSession } = useSession();
  const locale = authSession?.user.locale ?? 'es';
  const detail = useSessionDetail(sessionId);
  // Con los archivados: una sesión de hace meses puede tener series de un ejercicio que
  // ya no se sigue, y sin su nombre la pantalla se llenaría de filas sin encabezado.
  const exercises = useTrackedExercises({ includeArchived: true });
  const startedAt = detail.data?.startedAt;

  return (
    <>
      <ScreenHeader
        title={startedAt === undefined ? 'Sesión' : formatSessionDate(startedAt, locale)}
        backTo={BACK_TO_HISTORY}
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
  const totals = summarizeSession(session.sets);
  const endedAt = session.endedAt;
  const duration = endedAt === null ? null : durationSecondsBetween(session.startedAt, endedAt);

  return (
    <div className={styles.stack}>
      {endedAt === null && (
        <Notice title="Esta sesión sigue abierta">
          Lo que registres ahora entra aquí. <Link to={SESSION_PATH}>Ir a la sesión en curso</Link>
        </Notice>
      )}

      <Surface as="section" className={styles.summary}>
        <Metric
          label="Horario"
          value={
            endedAt === null
              ? formatTime(session.startedAt, locale)
              : `${formatTime(session.startedAt, locale)} – ${formatTime(endedAt, locale)}`
          }
        />
        {duration !== null && <Metric label="Duración" value={formatDuration(duration)} />}
        <Metric label="Series" value={pluralize(totals.workingSetCount, 'serie', 'series')} />
        <Metric
          label="Ejercicios"
          value={pluralize(totals.exerciseCount, 'ejercicio', 'ejercicios')}
        />
        <Metric label="Volumen" value={formatVolumeLabel(totals.volumeGrams, locale)} />
      </Surface>

      {session.notes !== null && (
        <Surface as="section">
          <p className={styles.sectionLabel}>Notas</p>
          <p className={styles.notes}>{session.notes}</p>
        </Surface>
      )}

      {groups.length === 0 ? (
        <Notice title="Esta sesión no tiene ninguna serie">
          Se abrió y se cerró sin registrar nada.
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
                  <SetRow key={set.id} set={set} position={index + 1} locale={locale} />
                ))}
              </ol>
            </Surface>
          ))}
        </div>
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
  readonly position: number;
  readonly locale: Locale;
}

/** Una serie ya cerrada: se lee, no se toca. Corregirla solo se puede con la sesión abierta. */
function SetRow({ set, position, locale }: SetRowProps) {
  return (
    <li className={styles.set}>
      <span className={styles.setPosition}>{position}</span>
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
