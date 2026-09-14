import {
  NO_DEVICE_SIGNALS,
  type Locale,
  type TrainingSignals,
  type WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { Link } from 'react-router';
import { useTrackedExercises, useTrainingSignals } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Notice, PlateStack, Surface } from '../../components/index';
import { useNow } from '../../hooks/use-now';
import {
  formatDaysAgo,
  formatStopwatch,
  formatTime,
  formatVolumeLabel,
  formatWeightLabel,
  pluralize,
} from '../../lib/format';
import { elapsedSecondsSince } from '../../lib/time';
import { usesOlympicBar } from '../exercises/equipment';
import { RECORD_LABELS } from '../exercises/labels';
import { LiveMascot } from '../mascot/LiveMascot';
import { useOpenSession } from '../../offline/use-open-session';
import { SESSION_PATH } from '../session/paths';
import { SETTINGS_PATH } from '../settings/paths';
import { summarizeLiveSession } from './live-session';
import { homeSessionState } from './open-session';
import { RoutineShortcuts } from './RoutineShortcuts';
import { WeekCalendar } from './WeekCalendar';
import styles from './HomeScreen.module.css';

/** Resumen de cómo vas: las señales de `GET /stats/signals`, las mismas que verá la mascota. */
export function HomeScreen() {
  const { session } = useSession();
  const signals = useTrainingSignals();
  const displayName = session?.user.displayName ?? '';
  const locale = session?.user.locale ?? 'es';

  return (
    <>
      <ScreenHeader
        title={`Hola, ${displayName}`}
        action={
          <Link to={SETTINGS_PATH} className={styles.settingsLink} aria-label="Ajustes">
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

      <section className={styles.metrics} aria-label="Cómo vas">
        <Metric label="Racha" value={pluralize(signals.weeklyStreak, 'semana', 'semanas')} />
        <Metric
          label="Esta semana"
          value={pluralize(signals.sessionsThisWeek, 'sesión', 'sesiones')}
        />
        {signals.latestRecord === null ? (
          <Metric label="Último récord" value="—" />
        ) : (
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Último récord</span>
            <span className={styles.recordValue}>
              {formatWeightLabel(signals.latestRecord.value, locale)}
            </span>
            <Badge tone="record">{RECORD_LABELS[signals.latestRecord.kind]}</Badge>
          </div>
        )}
      </section>

      <WeekCalendar locale={locale} />

      {signals.stalled.length > 0 && (
        <Notice
          tone="warning"
          title={pluralize(signals.stalled.length, 'ejercicio estancado', 'ejercicios estancados')}
        >
          Mismo peso durante varias sesiones sin perder repeticiones: toca subir.
        </Notice>
      )}
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
    <Link to={SESSION_PATH} className={styles.live} aria-label="Seguir la sesión">
      <span className={styles.liveHead}>
        <span className={styles.livePulse}>Sesión en curso</span>
        <span className={styles.liveSince}>desde las {formatTime(startedAt, locale)}</span>
      </span>
      <span className={styles.liveClock} role="timer">
        {formatStopwatch(elapsedSecondsSince(startedAt, now))}
      </span>
      {summary !== null && (
        <span className={styles.liveMeta}>
          {pluralize(summary.exerciseCount, 'ejercicio', 'ejercicios')} ·{' '}
          {pluralize(summary.setCount, 'serie', 'series')} ·{' '}
          {formatVolumeLabel(summary.volumeGrams, locale)}
        </span>
      )}
      {lastSet !== null && (
        <span className={styles.lastSet}>
          {usesOlympicBar(lastSet.equipment) && (
            <PlateStack weight={lastSet.weight} locale={locale} className={styles.lastSetPlates} />
          )}
          <span className={styles.lastSetText}>
            <span className={styles.lastSetName}>{lastSet.exerciseName}</span>
            <span className={styles.lastSetWhen}>Última serie</span>
          </span>
          <span className={styles.lastSetValue}>
            {formatWeightLabel(lastSet.weight, locale)} × {lastSet.reps}
          </span>
        </span>
      )}
      <span className={styles.liveAction} aria-hidden="true">
        Seguir la sesión →
      </span>
    </Link>
  );
}

interface StartCardProps {
  readonly lastSessionAt: string | null;
  readonly daysSinceLastSession: number | null;
}

/** Sin sesión abierta, empezar ocupa el mismo sitio: vacía o con una rutina. */
function StartCard({ lastSessionAt, daysSinceLastSession }: StartCardProps) {
  return (
    <Surface as="section" className={styles.start} aria-label="Empezar a entrenar">
      <p className={styles.startLabel}>
        {lastSessionAt === null || daysSinceLastSession === null
          ? 'Todavía no has entrenado'
          : `Última sesión: ${formatDaysAgo(daysSinceLastSession)}`}
      </p>
      <p className={styles.startTitle}>
        {lastSessionAt === null ? 'Cuando quieras, empezamos' : '¿Entrenamos?'}
      </p>
      <Link to={SESSION_PATH} className={styles.cta}>
        Empezar a entrenar
      </Link>
      <RoutineShortcuts />
    </Surface>
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
