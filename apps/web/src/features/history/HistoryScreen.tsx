import type { Locale, WorkoutSessionSummary } from '@gymbuddy/shared';
import { Link } from 'react-router';
import { useSessionHistory } from '../../api/queries';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import {
  Badge,
  Button,
  Notice,
  SkeletonList,
  Surface,
  listEntranceProps,
} from '../../components/index';
import { formatSessionDate, formatTime } from '../../lib/format';
import { sessionDetailPath } from './paths';
import styles from './HistoryScreen.module.css';
import { plural, t, useLocale } from '../../i18n/index';

/** Un mes largo de entrenamiento entra de un tirón; lo anterior se pide al bajar. */
const PAGE_SIZE = 20;

/** Las últimas sesiones, de la más reciente a la más antigua. */
export function HistoryScreen() {
  const locale = useLocale();
  const history = useSessionHistory({ limit: PAGE_SIZE });
  const total = history.data?.pages[0]?.total;

  return (
    <>
      <ScreenHeader
        title={t('Historial', 'History')}
        subtitle={
          total === undefined
            ? undefined
            : plural(total, ['sesión', 'sesiones'], ['session', 'sessions'])
        }
      />
      <AsyncContent query={history} skeleton={<SkeletonList rows={6} />}>
        {(data) => {
          const items = data.pages.flatMap((page) => page.items);
          if (items.length === 0) {
            return (
              <Notice title={t('Aún no hay sesiones', 'No sessions yet')}>
                {t(
                  'Tu primera sesión aparecerá aquí en cuanto la cierres.',
                  'Your first session will appear here as soon as you finish it.',
                )}
              </Notice>
            );
          }

          return (
            <div className={styles.stack}>
              <ul className={styles.list}>
                {items.map((item, index) => (
                  <SessionRow key={item.id} session={item} locale={locale} index={index} />
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
                  {t('Cargar más', 'Load more')}
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
  /** Su sitio en la lista: es lo que decide en qué turno entra (ver `listEntranceProps`). */
  readonly index: number;
}

/** La fila entera abre el detalle: es lo único que se puede hacer con una sesión pasada. */
function SessionRow({ session, locale, index }: SessionRowProps) {
  return (
    <Surface as="li" padding="none" {...listEntranceProps(index)}>
      <Link to={sessionDetailPath(session.id)} className={styles.row}>
        <span className={styles.text}>
          <span className={styles.date}>{formatSessionDate(session.startedAt, locale)}</span>
          <span className={styles.meta}>
            {formatTime(session.startedAt, locale)}
            {session.endedAt !== null && ` – ${formatTime(session.endedAt, locale)}`}
          </span>
        </span>
        {session.endedAt === null ? (
          <Badge tone="accent">{t('En curso', 'In progress')}</Badge>
        ) : (
          <Badge>{plural(session.setCount, ['serie', 'series'], ['set', 'sets'])}</Badge>
        )}
      </Link>
    </Surface>
  );
}
