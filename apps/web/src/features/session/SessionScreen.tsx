import type {
  Locale,
  LogSetResponse,
  PersonalRecord,
  ResourceId,
  SetEntry,
  TrackedExercise,
  WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useStartSession } from '../../api/mutations';
import { useActiveSession, useTrackedExercises } from '../../api/queries';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { useSession } from '../../auth/SessionProvider';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Button, Notice, Surface } from '../../components/index';
import { useNow } from '../../hooks/use-now';
import { describeError } from '../../lib/errors';
import {
  formatRpe,
  formatStopwatch,
  formatTime,
  formatWeightLabel,
  pluralize,
} from '../../lib/format';
import { newResourceId } from '../../lib/ids';
import { elapsedSecondsSince } from '../../lib/time';
import { RECORD_LABELS } from '../exercises/labels';
import { parseResourceId } from '../exercises/paths';
import { EditSetSheet } from './EditSetSheet';
import { EndSessionSheet } from './EndSessionSheet';
import { LogSetSheet } from './LogSetSheet';
import { SESSION_EXERCISE_PARAM } from './paths';
import { RestTimer } from './RestTimer';
import { DEFAULT_REST_TARGET_SECONDS, type RestTargetSeconds } from './rest';
import { groupSetsByExercise, latestSetCompletedAt, type SessionExerciseGroup } from './summary';
import styles from './SessionScreen.module.css';

const BACK_TO_HOME: BackLink = { to: '/', label: 'Hoy' };

/**
 * La sesión en curso: el cronómetro, lo que llevas hecho y el botón de registrar. Es la
 * pantalla que se usa de pie y con una mano, así que todo lo que se toca está abajo.
 */
export function SessionScreen() {
  const [searchParams] = useSearchParams();
  const { session: authSession } = useSession();
  const locale = authSession?.user.locale ?? 'es';
  const active = useActiveSession();
  // Con los archivados: una serie de un ejercicio archivado a media sesión seguiría
  // necesitando su nombre para pintarse, y el selector ya filtra lo que se puede elegir.
  const exercises = useTrackedExercises({ includeArchived: true });

  const requestedExerciseId = parseResourceId(
    searchParams.get(SESSION_EXERCISE_PARAM) ?? undefined,
  );
  // Llegar desde la ficha de un ejercicio abre la hoja directamente: ese es el motivo de
  // venir. El valor inicial se decide en el primer pintado, sin efecto que lo resincronice.
  const [logging, setLogging] = useState(requestedExerciseId !== null);
  const [editing, setEditing] = useState<SetEntry | null>(null);
  const [ending, setEnding] = useState(false);
  const [restTarget, setRestTarget] = useState<RestTargetSeconds>(DEFAULT_REST_TARGET_SECONDS);
  const [records, setRecords] = useState<readonly PersonalRecord[]>([]);

  const handleLogged = (response: LogSetResponse): void => {
    setRecords((current) => [...current, ...response.records]);
    setLogging(false);
  };

  // Corregir al alza también bate marcas, así que se celebran igual que al registrar.
  const handleCorrected = (response: LogSetResponse): void => {
    setRecords((current) => [...current, ...response.records]);
    setEditing(null);
  };

  return (
    <>
      <ScreenHeader title="Sesión" backTo={BACK_TO_HOME} />
      <AsyncContent query={active}>
        {(data) => {
          // En una constante y no en `data.session`: el estrechamiento a "no es null"
          // no sobrevive al closure de dentro, y aquí abajo ya no es opcional.
          const workout = data.session;
          if (workout === null) return <StartSessionCard />;

          return (
            <AsyncContent query={exercises}>
              {(items) => (
                <ActiveSession
                  session={workout}
                  exercises={items}
                  locale={locale}
                  records={records}
                  requestedExerciseId={requestedExerciseId}
                  logging={logging}
                  editing={editing}
                  ending={ending}
                  restTarget={restTarget}
                  onRestTargetChange={setRestTarget}
                  onOpenLog={() => {
                    setLogging(true);
                  }}
                  onCloseLog={() => {
                    setLogging(false);
                  }}
                  onLogged={handleLogged}
                  onOpenEdit={setEditing}
                  onCloseEdit={() => {
                    setEditing(null);
                  }}
                  onCorrected={handleCorrected}
                  onOpenEnd={() => {
                    setEnding(true);
                  }}
                  onCloseEnd={() => {
                    setEnding(false);
                  }}
                />
              )}
            </AsyncContent>
          );
        }}
      </AsyncContent>
    </>
  );
}

/** Sin sesión abierta no hay nada que enseñar: solo el botón que empieza una. */
function StartSessionCard() {
  const start = useStartSession();

  return (
    <div className={styles.stack}>
      <Notice title="No tienes ninguna sesión abierta">
        Empieza una y ve registrando las series según las haces. El bot escribe en la misma.
      </Notice>

      {start.isError && (
        <Notice tone="danger" title="No se pudo empezar">
          {describeError(start.error)}
        </Notice>
      )}

      <Button
        size="lg"
        fullWidth
        loading={start.isPending}
        onClick={() => {
          start.mutate({ id: newResourceId(), source: 'web' });
        }}
      >
        Empezar a entrenar
      </Button>
    </div>
  );
}

interface ActiveSessionProps {
  readonly session: WorkoutSessionDetail;
  readonly exercises: readonly TrackedExercise[];
  readonly locale: Locale;
  readonly records: readonly PersonalRecord[];
  readonly requestedExerciseId: ResourceId | null;
  readonly logging: boolean;
  readonly editing: SetEntry | null;
  readonly ending: boolean;
  readonly restTarget: RestTargetSeconds;
  readonly onRestTargetChange: (target: RestTargetSeconds) => void;
  readonly onOpenLog: () => void;
  readonly onCloseLog: () => void;
  readonly onLogged: (response: LogSetResponse) => void;
  readonly onOpenEdit: (set: SetEntry) => void;
  readonly onCloseEdit: () => void;
  readonly onCorrected: (response: LogSetResponse) => void;
  readonly onOpenEnd: () => void;
  readonly onCloseEnd: () => void;
}

function ActiveSession({
  session,
  exercises,
  locale,
  records,
  requestedExerciseId,
  logging,
  editing,
  ending,
  restTarget,
  onRestTargetChange,
  onOpenLog,
  onCloseLog,
  onLogged,
  onOpenEdit,
  onCloseEdit,
  onCorrected,
  onOpenEnd,
  onCloseEnd,
}: ActiveSessionProps) {
  const navigate = useNavigate();
  const groups = groupSetsByExercise(session.sets, exercises);
  const lastSetAt = latestSetCompletedAt(session.sets);

  return (
    <div className={styles.stack}>
      <SessionClock session={session} locale={locale} />

      {lastSetAt !== null && (
        <RestTimer lastSetAt={lastSetAt} target={restTarget} onTargetChange={onRestTargetChange} />
      )}

      <Button size="lg" fullWidth onClick={onOpenLog}>
        Registrar serie
      </Button>

      {records.length > 0 && (
        <Notice tone="success" title={pluralize(records.length, 'marca nueva', 'marcas nuevas')}>
          <ul className={styles.records}>
            {records.map((record) => (
              <li key={record.id}>
                {RECORD_LABELS[record.kind]}: {formatWeightLabel(record.value, locale)}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {groups.length === 0 ? (
        <Notice title="Todavía no has registrado ninguna serie">
          Registra la primera y aquí irá apareciendo lo que llevas hecho.
        </Notice>
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => (
            <Surface as="section" key={group.trackedExerciseId} className={styles.group}>
              <h2 className={styles.groupTitle}>{group.name}</h2>
              <ol className={styles.sets}>
                {group.sets.map((set, index) => (
                  <SetRow
                    key={set.id}
                    set={set}
                    position={index + 1}
                    locale={locale}
                    onEdit={onOpenEdit}
                  />
                ))}
              </ol>
            </Surface>
          ))}
        </div>
      )}

      <Button variant="secondary" size="lg" fullWidth onClick={onOpenEnd}>
        Terminar sesión
      </Button>

      <LogSetSheet
        sessionId={session.id}
        exercises={exercises.filter((exercise) => exercise.archivedAt === null)}
        defaultExerciseId={requestedExerciseId}
        locale={locale}
        open={logging}
        onClose={onCloseLog}
        onLogged={onLogged}
      />

      <EditSetSheet
        sessionId={session.id}
        set={editing}
        exerciseName={editing === null ? '' : exerciseNameOf(editing, groups)}
        locale={locale}
        onClose={onCloseEdit}
        onUpdated={onCorrected}
        onRemoved={onCloseEdit}
      />

      <EndSessionSheet
        session={session}
        records={records}
        locale={locale}
        open={ending}
        onClose={onCloseEnd}
        onEnded={() => {
          void navigate('/');
        }}
      />
    </div>
  );
}

interface SessionClockProps {
  readonly session: WorkoutSessionDetail;
  readonly locale: Locale;
}

function SessionClock({ session, locale }: SessionClockProps) {
  const now = useNow();
  const elapsed = elapsedSecondsSince(session.startedAt, now);

  return (
    <Surface className={styles.clock}>
      <div className={styles.clockHead}>
        <Badge tone="accent">En curso</Badge>
        <span className={styles.clockStart}>Desde las {formatTime(session.startedAt, locale)}</span>
      </div>
      <p className={styles.clockValue} role="timer">
        {formatStopwatch(elapsed)}
      </p>
    </Surface>
  );
}

interface SetRowProps {
  readonly set: SetEntry;
  readonly position: number;
  readonly locale: Locale;
  readonly onEdit: (set: SetEntry) => void;
}

/** La fila entera abre la corrección: en el gimnasio se toca con el pulgar y sin mirar. */
function SetRow({ set, position, locale, onEdit }: SetRowProps) {
  return (
    <li>
      <button
        type="button"
        className={styles.set}
        onClick={() => {
          onEdit(set);
        }}
      >
        <span className={styles.setPosition}>{position}</span>
        <span className={styles.setValue}>
          {formatWeightLabel(set.weight, locale)} × {set.reps}
        </span>
        <span className={styles.setMeta}>
          {set.isWarmup && <Badge>Calentamiento</Badge>}
          {set.rpe !== null && <span>{formatRpe(set.rpe, locale)}</span>}
          {set.source === 'bot' && <Badge>Telegram</Badge>}
        </span>
      </button>
    </li>
  );
}

/**
 * El nombre del ejercicio de una serie sale de los grupos que ya pinta la pantalla: el
 * título de la hoja tiene que decir qué se está corrigiendo, y ese dato ya está resuelto.
 */
function exerciseNameOf(set: SetEntry, groups: readonly SessionExerciseGroup[]): string {
  return groups.find((group) => group.trackedExerciseId === set.trackedExerciseId)?.name ?? '';
}
