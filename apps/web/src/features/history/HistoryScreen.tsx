import type { WorkoutSessionSummary } from '@gymbuddy/shared';
import { useSessionHistory } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Notice, Surface } from '../../components/index';
import { formatSessionDate, formatTime, pluralize } from '../../lib/format';
import styles from './HistoryScreen.module.css';

const PAGE_SIZE = 20;

/** Las últimas sesiones, de la más reciente a la más antigua. */
export function HistoryScreen() {
  const { session } = useSession();
  const locale = session?.user.locale ?? 'es';
  const history = useSessionHistory({ limit: PAGE_SIZE });

  return (
    <>
      <ScreenHeader title="Historial" />
      <AsyncContent query={history}>
        {(page) =>
          page.items.length === 0 ? (
            <Notice title="Aún no hay sesiones">
              Tu primera sesión aparecerá aquí en cuanto la cierres.
            </Notice>
          ) : (
            <ul className={styles.list}>
              {page.items.map((item) => (
                <SessionRow key={item.id} session={item} locale={locale} />
              ))}
            </ul>
          )
        }
      </AsyncContent>
    </>
  );
}

function SessionRow({
  session,
  locale,
}: {
  readonly session: WorkoutSessionSummary;
  readonly locale: 'es' | 'en';
}) {
  return (
    <Surface as="li" className={styles.row}>
      <div className={styles.text}>
        <span className={styles.date}>{formatSessionDate(session.startedAt, locale)}</span>
        <span className={styles.meta}>
          {formatTime(session.startedAt, locale)}
          {session.endedAt !== null && ` – ${formatTime(session.endedAt, locale)}`}
          {session.source === 'bot' && ' · desde el bot'}
        </span>
      </div>
      {session.endedAt === null ? (
        <Badge tone="accent">En curso</Badge>
      ) : (
        <Badge>{pluralize(session.setCount, 'serie', 'series')}</Badge>
      )}
    </Surface>
  );
}
