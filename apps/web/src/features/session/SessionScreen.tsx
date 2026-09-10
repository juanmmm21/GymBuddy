import type {
  Locale,
  LogSetResponse,
  PersonalRecord,
  ResourceId,
  Routine,
  SetEntry,
  TrackedExercise,
  WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useStartSession } from '../../api/mutations';
import { useActiveSession, useRoutines, useTrackedExercises } from '../../api/queries';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { useStorage } from '../../app/StorageProvider';
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
import { newResourceId, parseResourceId } from '../../lib/ids';
import { elapsedSecondsSince } from '../../lib/time';
import { RECORD_LABELS } from '../exercises/labels';
import { describeRoutineSize } from '../routines/items';
import { EditSetSheet } from './EditSetSheet';
import { EndSessionSheet } from './EndSessionSheet';
import { LogSetSheet } from './LogSetSheet';
import { SESSION_EXERCISE_PARAM, SESSION_ROUTINE_PARAM } from './paths';
import { RestTimer } from './RestTimer';
import { DEFAULT_REST_TARGET_SECONDS, type RestTargetSeconds } from './rest';
import { routineProgress } from './routine-progress';
import { RoutineGuide } from './RoutineGuide';
import {
  clearSessionRoutine,
  loadSessionRoutine,
  saveSessionRoutine,
} from './session-routine-store';
import { groupSetsByExercise, latestSetCompletedAt, type SessionExerciseGroup } from './summary';
import styles from './SessionScreen.module.css';

const BACK_TO_HOME: BackLink = { to: '/', label: 'Hoy' };

/** Con qué ejercicio se abre la hoja de registro; `null` es el primero de la lista. */
interface LogSheetTarget {
  readonly exerciseId: ResourceId | null;
}

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
  const requestedRoutineId = parseResourceId(searchParams.get(SESSION_ROUTINE_PARAM) ?? undefined);
  // Llegar desde la ficha de un ejercicio abre la hoja directamente: ese es el motivo de
  // venir. El valor inicial se decide en el primer pintado, sin efecto que lo resincronice.
  const [logging, setLogging] = useState<LogSheetTarget | null>(
    requestedExerciseId === null ? null : { exerciseId: requestedExerciseId },
  );
  const [editing, setEditing] = useState<SetEntry | null>(null);
  const [ending, setEnding] = useState(false);
  const [restTarget, setRestTarget] = useState<RestTargetSeconds>(DEFAULT_REST_TARGET_SECONDS);
  const [records, setRecords] = useState<readonly PersonalRecord[]>([]);

  const handleLogged = (response: LogSetResponse): void => {
    setRecords((current) => [...current, ...response.records]);
    setLogging(null);
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
          if (workout === null) return <StartSessionCard routineId={requestedRoutineId} />;

          return (
            <AsyncContent query={exercises}>
              {(items) => (
                <ActiveSession
                  // Una por sesión: la rutina que recuerda es de esta, no de la siguiente.
                  key={workout.id}
                  session={workout}
                  exercises={items}
                  locale={locale}
                  records={records}
                  requestedExerciseId={requestedExerciseId}
                  requestedRoutineId={requestedRoutineId}
                  logging={logging}
                  editing={editing}
                  ending={ending}
                  restTarget={restTarget}
                  onRestTargetChange={setRestTarget}
                  onOpenLog={(exerciseId) => {
                    setLogging({ exerciseId });
                  }}
                  onCloseLog={() => {
                    setLogging(null);
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

/**
 * Sin sesión abierta no hay nada que enseñar: solo el botón que empieza una. Si se llega
 * desde una rutina se dice cuál, y se lee del mismo listado que usa su editor.
 */
function StartSessionCard({ routineId }: { readonly routineId: ResourceId | null }) {
  const routines = useRoutines({ includeArchived: true }, { enabled: routineId !== null });

  if (routineId === null) return <StartSessionPanel routineId={null} routine={null} />;

  return (
    <AsyncContent query={routines}>
      {(items) => (
        <StartSessionPanel
          routineId={routineId}
          routine={items.find((candidate) => candidate.id === routineId) ?? null}
        />
      )}
    </AsyncContent>
  );
}

interface StartSessionPanelProps {
  /** La rutina que pedía la URL, o `null` si se llega a entrenar sin ninguna. */
  readonly routineId: ResourceId | null;
  /** La rutina encontrada; `null` también cuando la pedida no está entre las del usuario. */
  readonly routine: Routine | null;
}

function StartSessionPanel({ routineId, routine }: StartSessionPanelProps) {
  const start = useStartSession();
  const storage = useStorage();

  const handleStart = (): void => {
    const sessionId = newResourceId();
    // Se recuerda antes de mandar y con el id que pone el cliente: si el alta sale bien la
    // sesión lleva ese id, y este panel se desmonta en cuanto aparece la sesión abierta, así
    // que un `onSuccess` de aquí podría no llegar a ejecutarse.
    if (routine !== null) saveSessionRoutine(storage, { sessionId, routineId: routine.id });
    start.mutate({ id: sessionId, source: 'web' });
  };

  return (
    <div className={styles.stack}>
      {routine === null ? (
        <Notice title="No tienes ninguna sesión abierta">
          Empieza una y ve registrando las series según las haces. El bot escribe en la misma.
        </Notice>
      ) : (
        <Notice title={`Vas a empezar «${routine.name}»`}>
          {describeRoutineSize(routine.items)}. Irás viendo qué ejercicio toca y cuántas series
          llevas de cada uno.
        </Notice>
      )}

      {routineId !== null && routine === null && (
        <Notice tone="warning" title="No encontramos esa rutina">
          No está entre tus rutinas. Puedes empezar igualmente y registrar lo que hagas.
        </Notice>
      )}

      {start.isError && (
        <Notice tone="danger" title="No se pudo empezar">
          {describeError(start.error)}
        </Notice>
      )}

      <Button size="lg" fullWidth loading={start.isPending} onClick={handleStart}>
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
  /** La rutina que trae la URL; sin ella manda la que se recordó para esta sesión. */
  readonly requestedRoutineId: ResourceId | null;
  readonly logging: LogSheetTarget | null;
  readonly editing: SetEntry | null;
  readonly ending: boolean;
  readonly restTarget: RestTargetSeconds;
  readonly onRestTargetChange: (target: RestTargetSeconds) => void;
  readonly onOpenLog: (exerciseId: ResourceId | null) => void;
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
  requestedRoutineId,
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
  const storage = useStorage();
  // Se lee una sola vez: la pantalla monta una `ActiveSession` por sesión y lo guardado
  // solo cambia desde aquí dentro. Si la URL trae una rutina, manda la de la URL.
  const [storedRoutineId] = useState(() => loadSessionRoutine(storage, session.id));
  const routineId = requestedRoutineId ?? storedRoutineId;
  const routines = useRoutines({ includeArchived: true }, { enabled: routineId !== null });
  const routine =
    routineId === null
      ? null
      : (routines.data?.find((candidate) => candidate.id === routineId) ?? null);
  const progress = routine === null ? null : routineProgress(routine.items, session.sets);

  const groups = groupSetsByExercise(session.sets, exercises);
  const lastSetAt = latestSetCompletedAt(session.sets);
  const routineExerciseIds = new Set(routine?.items.map((item) => item.trackedExerciseId));
  // Un archivado que nombra la rutina se puede registrar: su línea lo pide y el Worker lo acepta.
  const selectable = exercises.filter(
    (exercise) => exercise.archivedAt === null || routineExerciseIds.has(exercise.id),
  );

  // Abrir el registro con la rutina delante es seguirla, y se recuerda ahí: «Seguir» en Hoy
  // lleva a la sesión sin la rutina en la URL, y el guion no puede perderse por el camino.
  const openLog = (exerciseId: ResourceId | null): void => {
    if (routine !== null) {
      saveSessionRoutine(storage, { sessionId: session.id, routineId: routine.id });
    }
    onOpenLog(exerciseId);
  };

  return (
    <div className={styles.stack}>
      <SessionClock session={session} locale={locale} />

      {lastSetAt !== null && (
        <RestTimer lastSetAt={lastSetAt} target={restTarget} onTargetChange={onRestTargetChange} />
      )}

      <Button
        size="lg"
        fullWidth
        onClick={() => {
          openLog(progress?.current?.item.trackedExerciseId ?? requestedExerciseId);
        }}
      >
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

      {routineId !== null && (
        <AsyncContent query={routines}>
          {() =>
            routine === null || progress === null ? (
              <Notice tone="warning" title="No encontramos la rutina de esta sesión">
                No está entre tus rutinas. La sesión sigue abierta: registra lo que hagas como
                siempre.
              </Notice>
            ) : (
              <RoutineGuide
                routine={routine}
                progress={progress}
                exercises={exercises}
                onLogLine={(line) => {
                  openLog(line.item.trackedExerciseId);
                }}
              />
            )
          }
        </AsyncContent>
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
        exercises={selectable}
        defaultExerciseId={logging?.exerciseId ?? null}
        routineProgress={progress}
        locale={locale}
        open={logging !== null}
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
          // Cerrada la sesión, su rutina ya no guía nada.
          clearSessionRoutine(storage);
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
