import { NO_DEVICE_SIGNALS, type Locale, type TrainingSignals } from '@gymbuddy/shared';
import { Link } from 'react-router';
import { useTrainingSignals } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Button, Notice, Surface } from '../../components/index';
import {
  formatDaysAgo,
  formatSessionDate,
  formatTime,
  formatWeightLabel,
  pluralize,
} from '../../lib/format';
import { BACKUP_PATH } from '../backup/paths';
import { DEVICES_PATH } from '../devices/paths';
import { useInstallGuide } from '../install/InstallProvider';
import { INSTALL_PATH } from '../install/paths';
import { INVITE_PATH } from '../invitations/paths';
import { RECORD_LABELS } from '../exercises/labels';
import { LiveMascot } from '../mascot/LiveMascot';
import { useOpenSession } from '../../offline/use-open-session';
import { SESSION_PATH } from '../session/paths';
import { homeSessionState, type HomeSessionState } from './open-session';
import { RoutineShortcuts } from './RoutineShortcuts';
import { WeekCalendar } from './WeekCalendar';
import styles from './HomeScreen.module.css';

/** Resumen de cómo vas: las señales de `GET /stats/signals`, las mismas que verá la mascota. */
export function HomeScreen() {
  const { session, signOut } = useSession();
  const signals = useTrainingSignals();
  const { situation } = useInstallGuide();
  const displayName = session?.user.displayName ?? '';
  const locale = session?.user.locale ?? 'es';

  return (
    <>
      <ScreenHeader
        title={`Hola, ${displayName}`}
        action={
          <div className={styles.account}>
            <Link to={DEVICES_PATH} className={styles.accountLink}>
              Añadir otro dispositivo
            </Link>
            <Link to={INVITE_PATH} className={styles.accountLink}>
              Invitar a un amigo
            </Link>
            <Link to={BACKUP_PATH} className={styles.accountLink}>
              Copia de seguridad
            </Link>
            {situation.kind !== 'installed' && (
              <Link to={INSTALL_PATH} className={styles.accountLink}>
                Instalar la app
              </Link>
            )}
            <Button variant="ghost" onClick={signOut}>
              Salir
            </Button>
          </div>
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
