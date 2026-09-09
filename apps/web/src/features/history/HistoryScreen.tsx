import type { Locale, WorkoutSessionSummary } from '@gymbuddy/shared';
import { Link } from 'react-router';
import { useSessionHistory } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Button, Notice, Surface } from '../../components/index';
import { formatSessionDate, formatTime, pluralize } from '../../lib/format';
import { sessionDetailPath } from './paths';
import styles from './HistoryScreen.module.css';

/** Un mes largo de entrenamiento entra de un tirón; lo anterior se pide al bajar. */
const PAGE_SIZE = 20;

/** Las últimas sesiones, de la más reciente a la más antigua. */
export function HistoryScreen() {
  const { session } = useSession();
  const locale = session?.user.locale ?? 'es';
  const history = useSessionHistory({ limit: PAGE_SIZE });
  const total = history.data?.pages[0]?.total;

  return (
    <>
      <ScreenHeader
        title="Historial"
        subtitle={total === undefined ? undefined : pluralize(total, 'sesión', 'sesiones')}
      />
      <AsyncContent query={history}>
        {(data) => {
          const items = data.pages.flatMap((page) => page.items);
          if (items.length === 0) {
            return (
              <Notice title="Aún no hay sesiones">
                Tu primera sesión aparecerá aquí en cuanto la cierres.
              </Notice>
            );
          }

          return (
            <div className={styles.stack}>
              <ul className={styles.list}>
                {items.map((item) => (
                  <SessionRow key={item.id} session={item} locale={locale} />
                ))}
              </ul>
              {history.hasNextPage && (
                <Button
                  variant="secondary"
                  fullWidth
                  loading={history.isFetchingNextPage}
                  onClick={() => {
                    void history.fetchNextPage();
                  }}
                >
                  Cargar más
                </Button>
              )}
            </div>
          );
        }}
      </AsyncContent>
    </>
  );
}

interface SessionRowProps {
  readonly session: WorkoutSessionSummary;
  readonly locale: Locale;
}

/** La fila entera abre el detalle: es lo único que se puede hacer con una sesión pasada. */
function SessionRow({ session, locale }: SessionRowProps) {
  return (
    <Surface as="li" padding="none">
      <Link to={sessionDetailPath(session.id)} className={styles.row}>
        <span className={styles.text}>
          <span className={styles.date}>{formatSessionDate(session.startedAt, locale)}</span>
          <span className={styles.meta}>
            {formatTime(session.startedAt, locale)}
            {session.endedAt !== null && ` – ${formatTime(session.endedAt, locale)}`}
            {session.source === 'bot' && ' · desde el bot'}
          </span>
        </span>
        {session.endedAt === null ? (
          <Badge tone="accent">En curso</Badge>
        ) : (
          <Badge>{pluralize(session.setCount, 'serie', 'series')}</Badge>
        )}
      </Link>
    </Surface>
  );
}
