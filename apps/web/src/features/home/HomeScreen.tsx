import { NO_DEVICE_SIGNALS, type Locale, type TrainingSignals } from '@gymbuddy/shared';
import { Link } from 'react-router';
import { useTrainingSignals } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Notice, Surface } from '../../components/index';
import {
  formatDaysAgo,
  formatSessionDate,
  formatTime,
  formatWeightLabel,
  pluralize,
} from '../../lib/format';
import { RECORD_LABELS } from '../exercises/labels';
import { LiveMascot } from '../mascot/LiveMascot';
import { useOpenSession } from '../../offline/use-open-session';
import { SESSION_PATH } from '../session/paths';
import { SETTINGS_PATH } from '../settings/paths';
import { homeSessionState, type HomeSessionState } from './open-session';
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

  if (signals.lastSessionAt === null && sessionState.kind === 'none') {
    return (
      <div className={styles.stack}>
        <LiveMascot signals={signals} device={NO_DEVICE_SIGNALS} locale={locale} />
        <Notice title="Todavía no has entrenado">
          Cuando registres tu primera sesión, aquí verás tu racha y tus últimas marcas.
        </Notice>
        <SessionAction state={sessionState} locale={locale} />
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <LiveMascot signals={signals} device={NO_DEVICE_SIGNALS} locale={locale} />

      <SessionAction state={sessionState} locale={locale} />

      <WeekCalendar locale={locale} />

      <Surface as="section" className={styles.metrics}>
        <Metric label="Racha" value={pluralize(signals.weeklyStreak, 'semana', 'semanas')} />
        <Metric
          label="Esta semana"
          value={pluralize(signals.sessionsThisWeek, 'sesión', 'sesiones')}
        />
        <Metric
          label="Última sesión"
          value={
            signals.daysSinceLastSession === null
              ? '—'
              : formatDaysAgo(signals.daysSinceLastSession)
          }
        />
      </Surface>

      {signals.latestRecord !== null && (
        <Surface as="section">
          <p className={styles.sectionLabel}>Último récord</p>
          <p className={styles.recordValue}>
            {formatWeightLabel(signals.latestRecord.value, locale)}{' '}
            <Badge tone="record">{RECORD_LABELS[signals.latestRecord.kind]}</Badge>
          </p>
        </Surface>
      )}

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

interface SessionActionProps {
  readonly state: HomeSessionState;
  readonly locale: Locale;
}

function SessionAction({ state, locale }: SessionActionProps) {
  if (state.kind === 'none') {
    return (
      <>
        <Link to={SESSION_PATH} className={styles.cta}>
          Empezar a entrenar
        </Link>
        <RoutineShortcuts />
      </>
    );
  }

  return (
    <Surface className={styles.active}>
      <Badge tone="accent">Sesión en curso</Badge>
      <p className={styles.activeText}>
        Tienes una sesión abierta desde el {formatSessionDate(state.startedAt, locale)} a las{' '}
        {formatTime(state.startedAt, locale)}.
      </p>
      <Link to={SESSION_PATH}>Seguir</Link>
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
