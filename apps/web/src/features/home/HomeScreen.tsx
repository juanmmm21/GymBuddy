import {
  NO_DEVICE_SIGNALS,
  type Locale,
  type PersonalRecord,
  type TrainingSignals,
  type WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useCompetition, useTrackedExercises, useTrainingSignals } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, CountUp, Notice, PlateStack } from '../../components/index';
import { useNow } from '../../hooks/use-now';
import {
  formatDaysAgo,
  formatRecordValueLabel,
  formatStopwatch,
  formatTime,
  formatVolumeLabel,
  formatSetValueLabel,
} from '../../lib/format';
import { elapsedSecondsSince } from '../../lib/time';
import { COMPETITION_PATH } from '../competition/paths';
import { boardAgainst } from '../competition/standings';
import { drawsPlates } from '../exercises/equipment';
import { recordLabel } from '../exercises/labels';
import { LiveMascot } from '../mascot/LiveMascot';
import { useOpenSession } from '../../offline/use-open-session';
import { SESSION_PATH } from '../session/paths';
import { SETTINGS_PATH } from '../settings/paths';
import { summarizeLiveSession } from './live-session';
import { homeSessionState } from './open-session';
import { RoutineShortcuts } from './RoutineShortcuts';
import { WeekCalendar } from './WeekCalendar';
import styles from './HomeScreen.module.css';
import { plural, t, useLocale } from '../../i18n/index';

/** Resumen de cómo vas: las señales de `GET /stats/signals`, las mismas que verá la mascota. */
export function HomeScreen() {
  const { session } = useSession();
  const signals = useTrainingSignals();
  const displayName = session?.user.displayName ?? '';
  const locale = useLocale();

  return (
    <>
      <ScreenHeader
        title={t(`Hola, ${displayName}`, `Hi, ${displayName}`)}
        action={
          <Link
            to={SETTINGS_PATH}
            className={styles.settingsLink}
            aria-label={t('Ajustes', 'Settings')}
          >
            <SettingsIcon />
          </Link>
        }
      />
      <AsyncContent query={signals}>
        {(data) => <SignalsSummary signals={data} locale={locale} />}
      </AsyncContent>
    </>
  );
}

interface SignalsSummaryProps {
  readonly signals: TrainingSignals;
  readonly locale: Locale;
}

function SignalsSummary({ signals, locale }: SignalsSummaryProps) {
  // Con la cola offline encima: lo abierto o cerrado sin cobertura cuenta ya aquí.
  const open = useOpenSession();
  const sessionState = homeSessionState(signals, open.data);
  const liveSession = sessionState.kind === 'open' ? (open.data?.session ?? null) : null;

  if (signals.lastSessionAt === null && sessionState.kind === 'none') {
    return (
      <div className={styles.stack}>
        <StartCard lastSessionAt={null} daysSinceLastSession={null} />
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      {sessionState.kind === 'open' ? (
        <LiveSessionCard startedAt={sessionState.startedAt} session={liveSession} locale={locale} />
      ) : (
        <StartCard
          lastSessionAt={signals.lastSessionAt}
          daysSinceLastSession={signals.daysSinceLastSession}
        />
      )}

      <LiveMascot signals={signals} device={NO_DEVICE_SIGNALS} locale={locale} spot="home" />

      <section className={styles.metrics} aria-label={t('Cómo vas', 'How you’re doing')}>
        <Metric
          label={
            signals.weeklyStreak === 1
              ? t('semana de racha', 'week streak')
              : t('semanas de racha', 'weeks streak')
          }
          spoken={t(
            `Racha: ${plural(signals.weeklyStreak, ['semana', 'semanas'], ['week', 'weeks'])}`,
            `Streak: ${plural(signals.weeklyStreak, ['semana', 'semanas'], ['week', 'weeks'])}`,
          )}
          value={<CountUp value={signals.weeklyStreak} format={String} />}
        />
        <Metric
          label={
            signals.sessionsThisWeek === 1
              ? t('sesión esta semana', 'session this week')
              : t('sesiones esta semana', 'sessions this week')
          }
          spoken={t(
            `Esta semana: ${plural(signals.sessionsThisWeek, ['sesión', 'sesiones'], ['session', 'sessions'])}`,
            `This week: ${plural(signals.sessionsThisWeek, ['sesión', 'sesiones'], ['session', 'sessions'])}`,
          )}
          value={<CountUp value={signals.sessionsThisWeek} format={String} />}
        />
        {signals.latestRecord === null ? (
          <Metric
            label={t('último récord', 'latest record')}
            spoken={t('Último récord: ninguno', 'Latest record: none')}
            value="—"
          />
        ) : (
          <LatestRecordMetric record={signals.latestRecord} locale={locale} />
        )}
      </section>

      <WeekCalendar locale={locale} />

      <CompetitionTeaser />

      {signals.stalled.length > 0 && (
        <Notice
          tone="warning"
          title={plural(
            signals.stalled.length,
            ['ejercicio estancado', 'ejercicios estancados'],
            ['stalled exercise', 'stalled exercises'],
          )}
        >
          {t(
            'Mismo peso durante varias sesiones sin perder repeticiones: toca subir.',
            'Same weight for several sessions without losing reps: time to go up.',
          )}
        </Notice>
      )}
    </div>
  );
}

/**
 * La entrada a competir, debajo de la semana. Con rivales enseña el marcador contra el primero —lo
 * que de verdad invita a entrar—; sin ellos, o mientras no ha llegado, solo dice qué hay dentro.
 */
function CompetitionTeaser() {
  const competition = useCompetition();
  const rival = competition.data?.rivals[0];
  const board =
    competition.data === undefined || rival === undefined
      ? null
      : boardAgainst(competition.data, rival);

  return (
    <Link to={COMPETITION_PATH} className={styles.competition}>
      <span className={styles.competitionText}>
        <span className={styles.competitionTitle}>
          {board === null
            ? t('Competir con amigos', 'Compete with friends')
            : t(`Tú contra ${board.rival.displayName}`, `You vs ${board.rival.displayName}`)}
        </span>
        <span className={styles.competitionDescription}>
          {board === null
            ? t('Quién levanta más en cada ejercicio.', 'Who lifts more in each exercise.')
            : t('Peso máximo, ejercicio a ejercicio.', 'Max weight, exercise by exercise.')}
        </span>
      </span>
      {board === null ? (
        <span className={styles.competitionChevron} aria-hidden="true">
          ›
        </span>
      ) : (
        <span
          className={styles.competitionScore}
          aria-label={t(
            `Marcador: tú ${String(board.wins)}, ${board.rival.displayName} ${String(board.losses)}`,
            `Score: you ${String(board.wins)}, ${board.rival.displayName} ${String(board.losses)}`,
          )}
        >
          {board.wins}
          <span className={styles.competitionDash} aria-hidden="true">
            –
          </span>
          {board.losses}
        </span>
      )}
    </Link>
  );
}

interface LatestRecordMetricProps {
  readonly record: PersonalRecord;
  readonly locale: Locale;
}

/**
 * El último récord necesita su ejercicio para decir si es de un brazo. Mientras la lista no ha
 * llegado se lee sin «por brazo»: el número ya es el correcto y esperar dejaría la casilla vacía.
 */
function LatestRecordMetric({ record, locale }: LatestRecordMetricProps) {
  const exercises = useTrackedExercises({ includeArchived: true });
  const unilateral =
    exercises.data?.find((exercise) => exercise.id === record.trackedExerciseId)?.unilateral ??
    false;

  return (
    <div className={styles.metric}>
      <span className={styles.recordValue}>
        {formatRecordValueLabel(record, locale, unilateral)}
      </span>
      <Badge tone="record">{recordLabel(record.kind)}</Badge>
      <span className={styles.metricLabel}>{t('Último récord', 'Latest record')}</span>
    </div>
  );
}

interface LiveSessionCardProps {
  readonly startedAt: string;
  /** La sesión con la cola encima; nula mientras se lee, y entonces solo se cronometra. */
  readonly session: WorkoutSessionDetail | null;
  readonly locale: Locale;
}

/**
 * La sesión en curso manda en Hoy: oscura, con el cronómetro grande y la última serie con sus
 * discos. La tarjeta entera es el enlace, porque en el gimnasio se pulsa con el pulgar y sin mirar.
 */
function LiveSessionCard({ startedAt, session, locale }: LiveSessionCardProps) {
  const now = useNow();
  const exercises = useTrackedExercises({ includeArchived: true });
  const summary = session === null ? null : summarizeLiveSession(session, exercises.data ?? []);
  const lastSet = summary?.lastSet ?? null;

  return (
    <Link
      to={SESSION_PATH}
      className={styles.live}
      aria-label={t('Seguir la sesión', 'Continue the session')}
    >
      <span className={styles.liveHead}>
        <span className={styles.livePulse}>{t('Sesión en curso', 'Session in progress')}</span>
        <span className={styles.liveSince}>
          {t('desde las', 'since')} {formatTime(startedAt, locale)}
        </span>
      </span>
      <span className={styles.liveClock} role="timer">
        {formatStopwatch(elapsedSecondsSince(startedAt, now))}
      </span>
      {summary !== null && (
        <span className={styles.liveMeta}>
          {plural(summary.exerciseCount, ['ejercicio', 'ejercicios'], ['exercise', 'exercises'])} ·{' '}
          {plural(summary.setCount, ['serie', 'series'], ['set', 'sets'])} ·{' '}
          {formatVolumeLabel(summary.volumeGrams, locale)}
        </span>
      )}
      {lastSet !== null && (
        <span className={styles.lastSet}>
          {drawsPlates(lastSet) && lastSet.set.kind === 'strength' && (
            <PlateStack
              weight={lastSet.set.weight}
              locale={locale}
              className={styles.lastSetPlates}
            />
          )}
          <span className={styles.lastSetText}>
            <span className={styles.lastSetName}>{lastSet.exerciseName}</span>
            <span className={styles.lastSetWhen}>{t('Última serie', 'Last set')}</span>
          </span>
          <span className={styles.lastSetValue}>
            {formatSetValueLabel(lastSet.set, locale, lastSet.unilateral)}
          </span>
        </span>
      )}
      <span className={styles.liveAction} aria-hidden="true">
        {t('Seguir la sesión →', 'Continue the session →')}
      </span>
    </Link>
  );
}

interface StartCardProps {
  readonly lastSessionAt: string | null;
  readonly daysSinceLastSession: number | null;
}

/**
 * Sin sesión abierta, empezar ocupa el mismo sitio y con el mismo peso: el bloque lima de la
 * dirección «Marcador». La tarjeta entera es el enlace, como la de la sesión en curso; los atajos
 * de las rutinas van debajo, fuera del bloque, para que no compitan con él.
 */
function StartCard({ lastSessionAt, daysSinceLastSession }: StartCardProps) {
  const lastId = useId();
  return (
    <section className={styles.startStack} aria-label={t('Empezar a entrenar', 'Start training')}>
      {/* El nombre es la acción; cuándo fue la última sesión va de descripción, no delante. */}
      <Link
        to={SESSION_PATH}
        className={styles.start}
        aria-label={t('Empezar a entrenar', 'Start training')}
        aria-describedby={lastId}
      >
        <span id={lastId} className={styles.startLabel}>
          {lastSessionAt === null || daysSinceLastSession === null
            ? t('Todavía no has entrenado', 'You haven’t trained yet')
            : t(
                `Última sesión: ${formatDaysAgo(daysSinceLastSession)}`,
                `Last session: ${formatDaysAgo(daysSinceLastSession)}`,
              )}
        </span>
        <span className={styles.startTitle}>{t('Empezar a entrenar', 'Start training')}</span>
        <span className={styles.startHint}>
          {lastSessionAt === null
            ? t('Cuando quieras, empezamos', 'Whenever you’re ready')
            : t('¿Entrenamos?', 'Shall we train?')}
        </span>
      </Link>
      <RoutineShortcuts />
    </section>
  );
}

/**
 * Una casilla de «Cómo vas»: la cifra enorme y lo que cuenta debajo, como en un marcador. La cifra
 * cuenta hasta su número al entrar (`CountUp`), así que se lee entera por el nombre de la casilla.
 */
function Metric({
  label,
  spoken,
  value,
}: {
  readonly label: string;
  readonly spoken: string;
  readonly value: ReactNode;
}) {
  return (
    <div className={styles.metric} role="group" aria-label={spoken}>
      <span className={styles.metricValue} aria-hidden="true">
        {value}
      </span>
      <span className={styles.metricLabel} aria-hidden="true">
        {label}
      </span>
    </div>
  );
}

/** El engranaje de Ajustes: trazo simple, del mismo grosor que los iconos de las pestañas. */
function SettingsIcon() {
  return (
    <svg
      className={styles.settingsIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
