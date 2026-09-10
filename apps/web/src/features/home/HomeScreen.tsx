import type { Locale, TrainingSignals } from '@gymbuddy/shared';
import { Link } from 'react-router';
import { useTrainingSignals } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Button, Notice, Surface } from '../../components/index';
import { formatDaysAgo, formatWeightLabel, pluralize } from '../../lib/format';
import { RECORD_LABELS } from '../exercises/labels';
import { SESSION_PATH } from '../session/paths';
import { RoutineShortcuts } from './RoutineShortcuts';
import { WeekCalendar } from './WeekCalendar';
import styles from './HomeScreen.module.css';

/** Resumen de cómo vas: las señales de `GET /stats/signals`, las mismas que verá la mascota. */
export function HomeScreen() {
  const { session, signOut } = useSession();
  const signals = useTrainingSignals();
  const firstName = session?.user.firstName ?? '';
  const locale = session?.user.locale ?? 'es';

  return (
    <>
      <ScreenHeader
        title={`Hola, ${firstName}`}
        action={
          <Button variant="ghost" onClick={signOut}>
            Salir
          </Button>
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
  if (signals.lastSessionAt === null) {
    return (
      <div className={styles.stack}>
        <Notice title="Todavía no has entrenado">
          Cuando registres tu primera sesión, aquí verás tu racha y tus últimas marcas.
        </Notice>
        <Link to={SESSION_PATH} className={styles.cta}>
          Empezar a entrenar
        </Link>
        <RoutineShortcuts />
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      {signals.activeSessionId === null ? (
        <>
          <Link to={SESSION_PATH} className={styles.cta}>
            Empezar a entrenar
          </Link>
          <RoutineShortcuts />
        </>
      ) : (
        <Surface className={styles.active}>
          <Badge tone="accent">Sesión en curso</Badge>
          <p className={styles.activeText}>Tienes una sesión abierta.</p>
          <Link to={SESSION_PATH}>Seguir</Link>
        </Surface>
      )}

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
            <Badge tone="success">{RECORD_LABELS[signals.latestRecord.kind]}</Badge>
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

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  );
}
