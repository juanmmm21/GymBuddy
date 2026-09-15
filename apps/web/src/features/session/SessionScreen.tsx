import {
  bestPersonalRecords,
  type Locale,
  type PersonalRecord,
  type ResourceId,
  type Routine,
  type SetEntry,
  type TrackedExercise,
  type WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useStartCardio, useStartSession } from '../../api/mutations';
import { useRoutines, useTrackedExercises } from '../../api/queries';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { useStorage } from '../../app/StorageProvider';
import { useSession } from '../../auth/SessionProvider';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Button, Notice, PlateStack, Surface } from '../../components/index';
import { useNow } from '../../hooks/use-now';
import { describeError } from '../../lib/errors';
import {
  formatRpe,
  formatStopwatch,
  formatTime,
  formatSetValueLabel,
  pluralize,
} from '../../lib/format';
import { newResourceId, parseResourceId } from '../../lib/ids';
import { elapsedSecondsSince } from '../../lib/time';
import { useOpenSession } from '../../offline/use-open-session';
import { LiveMascot } from '../mascot/LiveMascot';
import { openSessionSignals, sessionDeviceSignals } from '../mascot/mascot-signals';
import { describeRoutineSize } from '../routines/items';
import { EditSetSheet } from './EditSetSheet';
import { EndSessionSheet } from './EndSessionSheet';
import { CardioInProgressCard } from './CardioInProgressCard';
import { finalCardioOffer, suggestedCardioExerciseId } from './final-cardio';
import { SessionRecordItems } from './SessionRecordItems';
import { LogSetSheet } from './LogSetSheet';
import { logExerciseIdFor } from './log-target';
import { SESSION_EXERCISE_PARAM, SESSION_ROUTINE_PARAM } from './paths';
import { RestTimer } from './RestTimer';
import { restTargetFor, withRestTarget, type RestKind, type RestPreferences } from './rest';
import { loadRestPreferences, saveRestPreferences } from './rest-preferences-store';
import { AdjustLineSheet } from './AdjustLineSheet';
import {
  NO_ADJUSTMENTS,
  withLineChoice,
  withoutLineAdjustment,
  type RoutineLineAdjustment,
} from './routine-adjustments';
import { restKindAfter, routineProgress, type RoutineLineProgress } from './routine-progress';
import { RoutineGuide } from './RoutineGuide';
import {
  clearSessionRoutine,
  loadSessionRoutine,
  saveSessionRoutine,
} from './session-routine-store';
import { groupSetsByExercise, latestSetCompletedAt, type SessionExerciseGroup } from './summary';
import styles from './SessionScreen.module.css';
import { usesOlympicBar } from '../exercises/equipment';

const BACK_TO_HOME: BackLink = { to: '/', label: 'Hoy' };

/** Con qué se abre la hoja de registro. */
interface LogSheetTarget {
  /** `null` es el primero de la lista. */
  readonly exerciseId: ResourceId | null;
  /** Viene de «Terminar sesión»: apuntado el cardio final, se vuelve a esa hoja. */
  readonly thenEnd: boolean;
}

/**
 * La sesión en curso: el cronómetro, lo que llevas hecho y el botón de registrar. Es la
 * pantalla que se usa de pie y con una mano, así que todo lo que se toca está abajo.
 */
export function SessionScreen() {
  const [searchParams] = useSearchParams();
  const { session: authSession } = useSession();
  const locale = authSession?.user.locale ?? 'es';
  // Con lo que espera en la cola offline encima: sin cobertura, lo registrado se sigue viendo.
  const active = useOpenSession();
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
    requestedExerciseId === null ? null : { exerciseId: requestedExerciseId, thenEnd: false },
  );
  const [editing, setEditing] = useState<SetEntry | null>(null);
  const [ending, setEnding] = useState(false);
  const storage = useStorage();
  // Se lee una vez al montar y se guarda en el mismo toque que lo cambia: sin efectos.
  const [restPreferences, setRestPreferences] = useState(() => loadRestPreferences(storage));
  const [records, setRecords] = useState<readonly PersonalRecord[]>([]);

  const handleLogged = (fresh: readonly PersonalRecord[]): void => {
    setRecords((current) => [...current, ...fresh]);
    // Tras el cardio final se vuelve a terminar: es lo que se estaba haciendo al pedirlo.
    if (logging?.thenEnd === true) setEnding(true);
    setLogging(null);
  };

  // Corregir al alza también bate marcas, así que se celebran igual que al registrar.
  const handleCorrected = (fresh: readonly PersonalRecord[]): void => {
    setRecords((current) => [...current, ...fresh]);
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
            // Sin red fallan las dos relecturas a la vez: el aviso de la sesión ya lo cuenta.
            <AsyncContent query={exercises} quietRefetchError>
              {(items) => (
                <ActiveSession
                  // Una por sesión: la rutina que recuerda es de esta, no de la siguiente.
                  key={workout.id}
                  session={workout}
                  pendingSetIds={data.pendingSetIds}
                  exercises={items}
                  locale={locale}
                  records={records}
                  requestedExerciseId={requestedExerciseId}
                  requestedRoutineId={requestedRoutineId}
                  logging={logging}
                  editing={editing}
                  ending={ending}
                  restPreferences={restPreferences}
                  onRestTargetChange={(kind, seconds) => {
                    const next = withRestTarget(restPreferences, kind, seconds);
                    setRestPreferences(next);
                    saveRestPreferences(storage, next);
                  }}
                  onOpenLog={(exerciseId) => {
                    setLogging({ exerciseId, thenEnd: false });
                  }}
                  onOpenFinalCardio={(exerciseId) => {
                    setEnding(false);
                    setLogging({ exerciseId, thenEnd: true });
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
  // Fijado al montar y no al pulsar: reintentar tras un fallo, o un doble toque sin red, es la
  // misma apertura y no dos sesiones.
  const [sessionId] = useState(newResourceId);

  const handleStart = (): void => {
    // Se recuerda antes de mandar y con el id que pone el cliente: si el alta sale bien la
    // sesión lleva ese id, y este panel se desmonta en cuanto aparece la sesión abierta, así
    // que un `onSuccess` de aquí podría no llegar a ejecutarse.
    if (routine !== null) {
      saveSessionRoutine(storage, { sessionId, routineId: routine.id, adjustments: [] });
    }
    start.mutate({ id: sessionId });
  };

  return (
    <div className={styles.stack}>
      {routine === null ? (
        <Notice title="No tienes ninguna sesión abierta">
          Empieza una y ve registrando las series según las haces.
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
  /** Las series que se ven pero aún esperan en la cola offline. */
  readonly pendingSetIds: ReadonlySet<ResourceId>;
  readonly exercises: readonly TrackedExercise[];
  readonly locale: Locale;
  readonly records: readonly PersonalRecord[];
  readonly requestedExerciseId: ResourceId | null;
  /** La rutina que trae la URL; sin ella manda la que se recordó para esta sesión. */
  readonly requestedRoutineId: ResourceId | null;
  readonly logging: LogSheetTarget | null;
  readonly editing: SetEntry | null;
  readonly ending: boolean;
  readonly restPreferences: RestPreferences;
  readonly onRestTargetChange: (kind: RestKind, seconds: number) => void;
  readonly onOpenLog: (exerciseId: ResourceId | null) => void;
  readonly onOpenFinalCardio: (exerciseId: ResourceId) => void;
  readonly onCloseLog: () => void;
  readonly onLogged: (records: readonly PersonalRecord[]) => void;
  readonly onOpenEdit: (set: SetEntry) => void;
  readonly onCloseEdit: () => void;
  readonly onCorrected: (records: readonly PersonalRecord[]) => void;
  readonly onOpenEnd: () => void;
  readonly onCloseEnd: () => void;
}

function ActiveSession({
  session,
  pendingSetIds,
  exercises,
  locale,
  records,
  requestedExerciseId,
  requestedRoutineId,
  logging,
  editing,
  ending,
  restPreferences,
  onRestTargetChange,
  onOpenLog,
  onOpenFinalCardio,
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
  const [stored, setStored] = useState(() => loadSessionRoutine(storage, session.id));
  const [adjusting, setAdjusting] = useState<RoutineLineProgress | null>(null);
  const routineId = requestedRoutineId ?? stored?.routineId ?? null;
  // Los ajustes son de la rutina con la que se guardaron: si la URL trae otra, esa va tal cual.
  const adjustments =
    stored !== null && stored.routineId === routineId ? stored.adjustments : NO_ADJUSTMENTS;
  const routines = useRoutines({ includeArchived: true }, { enabled: routineId !== null });
  const routine =
    routineId === null
      ? null
      : (routines.data?.find((candidate) => candidate.id === routineId) ?? null);
  const progress =
    routine === null ? null : routineProgress(routine.items, session.sets, adjustments);

  const groups = groupSetsByExercise(session.sets, exercises);
  const lastSetAt = latestSetCompletedAt(session.sets);
  const restKind = restKindAfter(progress, session.sets);
  const restTarget = restTargetFor(restPreferences, restKind);
  // Con los de la rutina y los que la sustituyen hoy: los dos se pueden registrar desde su línea.
  const routineExerciseIds = new Set(
    progress?.lines.flatMap((line) => [
      line.item.trackedExerciseId,
      line.planned.trackedExerciseId,
    ]),
  );
  // Un archivado que nombra la rutina se puede registrar: su línea lo pide y el Worker lo acepta.
  const selectable = exercises.filter(
    (exercise) => exercise.archivedAt === null || routineExerciseIds.has(exercise.id),
  );

  // Abrir el registro con la rutina delante es seguirla, y se recuerda ahí: «Seguir» en Hoy
  // lleva a la sesión sin la rutina en la URL, y el guion no puede perderse por el camino.
  const openLog = (exerciseId: ResourceId | null): void => {
    if (routine !== null) remember(adjustments);
    onOpenLog(exerciseId);
  };

  // Se guarda en el mismo toque que cambia la pantalla: sin efectos y sin esperar a la red.
  function remember(next: readonly RoutineLineAdjustment[]): void {
    if (routine === null) return;
    const link = { routineId: routine.id, adjustments: [...next] };
    setStored(link);
    saveSessionRoutine(storage, { sessionId: session.id, ...link });
  }

  const startCardio = useStartCardio();
  const cardioStartedAt = session.cardioStartedAt ?? null;
  const cardioExerciseId = suggestedCardioExerciseId(selectable, session.sets);
  const handleStartCardio = (): void => {
    startCardio.mutate({ sessionId: session.id });
  };

  const mascotSignals = openSessionSignals(session);
  // La mascota recibe todas: solo le importa cuándo llegó la última, no cuántas se repiten.
  const mascotDevice = sessionDeviceSignals(lastSetAt, restTarget, records);
  const bestRecords = bestPersonalRecords(records);

  return (
    <div className={styles.stack}>
      <SessionClock session={session} locale={locale} />

      <LiveMascot signals={mascotSignals} device={mascotDevice} locale={locale} spot="session">
        {records.length > 0 && (
          <div className={styles.records}>
            <p className={styles.recordsCount}>
              {pluralize(bestRecords.length, 'marca nueva', 'marcas nuevas')}
            </p>
            <ul className={styles.recordsList}>
              <SessionRecordItems records={bestRecords} exercises={exercises} locale={locale} />
            </ul>
          </div>
        )}
      </LiveMascot>

      {cardioStartedAt !== null ? (
        <CardioInProgressCard
          sessionId={session.id}
          startedAt={cardioStartedAt}
          locale={locale}
          canLog={cardioExerciseId !== null}
          onLog={() => {
            openLog(cardioExerciseId);
          }}
        />
      ) : (
        lastSetAt !== null && (
          <RestTimer
            lastSetAt={lastSetAt}
            kind={restKind}
            target={restTarget}
            onTargetChange={(seconds) => {
              onRestTargetChange(restKind, seconds);
            }}
            companion={
              <LiveMascot
                signals={mascotSignals}
                device={mascotDevice}
                locale={locale}
                spot="rest"
              />
            }
          />
        )
      )}

      <Button
        size="lg"
        fullWidth
        onClick={() => {
          // `session.sets` ya lleva la cola encima: sin red, la última serie es la que se acaba de apuntar.
          openLog(logExerciseIdFor(progress, session.sets, requestedExerciseId));
        }}
      >
        Registrar serie
      </Button>

      {cardioStartedAt === null && cardioExerciseId !== null && (
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          loading={startCardio.isPending}
          onClick={handleStartCardio}
        >
          Empezar cardio
        </Button>
      )}

      {startCardio.isError && (
        <Notice tone="danger" title="No se pudo empezar el cardio">
          {describeError(startCardio.error)}
        </Notice>
      )}

      {routineId !== null && (
        <AsyncContent query={routines} quietRefetchError>
          {() =>
            routine === null || progress === null ? (
              <Notice tone="warning" title="No encontramos la rutina de esta sesión">
                No está entre tus rutinas: quizá se borró desde otro móvil. La sesión sigue abierta:
                registra lo que hagas como siempre.
              </Notice>
            ) : (
              <RoutineGuide
                routine={routine}
                progress={progress}
                exercises={exercises}
                onLogLine={(line) => {
                  openLog(line.item.trackedExerciseId);
                }}
                onAdjustLine={setAdjusting}
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
                    plates={usesOlympicBar(group.equipment)}
                    pending={pendingSetIds.has(set.id)}
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
        sessionSets={session.sets}
        cardioStartedAt={cardioStartedAt}
        locale={locale}
        open={logging !== null}
        onClose={onCloseLog}
        onLogged={onLogged}
      />

      <AdjustLineSheet
        line={adjusting}
        exercises={exercises}
        onClose={() => {
          setAdjusting(null);
        }}
        onChoose={(line, choice) => {
          remember(withLineChoice(adjustments, line.planned, choice));
          setAdjusting(null);
        }}
        onRestore={(line) => {
          remember(withoutLineAdjustment(adjustments, line.planned.id));
          setAdjusting(null);
        }}
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
        records={bestRecords}
        exercises={exercises}
        locale={locale}
        finalCardio={finalCardioOffer(selectable, session.sets)}
        open={ending}
        onClose={onCloseEnd}
        onLogFinalCardio={onOpenFinalCardio}
        onStartFinalCardio={() => {
          handleStartCardio();
          onCloseEnd();
        }}
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
  /** Si se dibujan los discos: solo en ejercicios con barra olímpica. */
  readonly plates: boolean;
  readonly pending: boolean;
  readonly position: number;
  readonly locale: Locale;
  readonly onEdit: (set: SetEntry) => void;
}

/** La fila entera abre la corrección, también la de cardio: en el gimnasio se toca con el pulgar y sin mirar. */
function SetRow({ set, plates, pending, position, locale, onEdit }: SetRowProps) {
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
        {plates && set.kind === 'strength' && <PlateStack weight={set.weight} locale={locale} />}
        <span className={styles.setValue}>{formatSetValueLabel(set, locale)}</span>
        <span className={styles.setMeta}>
          {pending && <Badge tone="warning">Sin sincronizar</Badge>}
          {set.isWarmup && <Badge>Calentamiento</Badge>}
          {set.rpe !== null && <span>{formatRpe(set.rpe, locale)}</span>}
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
