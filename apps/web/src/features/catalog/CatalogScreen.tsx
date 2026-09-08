import type { BodyPartSummary } from '@gymbuddy/shared';
import { useBodyParts } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Notice, Surface } from '../../components/index';
import { pluralize } from '../../lib/format';
import { BODY_PART_LABELS, BODY_PART_ORDER } from './labels';
import styles from './CatalogScreen.module.css';

/** Las siete partes del cuerpo del catálogo, con cuántos ejercicios tiene cada una. */
export function CatalogScreen() {
  const { session } = useSession();
  const bodyParts = useBodyParts(session?.user.locale);

  return (
    <>
      <ScreenHeader title="Catálogo" subtitle="Elige una parte del cuerpo" />
      <AsyncContent query={bodyParts}>
        {(items) =>
          items.length === 0 ? (
            <Notice title="El catálogo todavía se está preparando">
              Se sincroniza por partes en segundo plano. Vuelve en unos minutos.
            </Notice>
          ) : (
            <ul className={styles.list}>
              {sortByBodyPart(items).map((item) => (
                <Surface as="li" key={item.bodyPart} className={styles.row}>
                  <span className={styles.name}>{BODY_PART_LABELS[item.bodyPart]}</span>
                  <Badge>{pluralize(item.exerciseCount, 'ejercicio', 'ejercicios')}</Badge>
                </Surface>
              ))}
            </ul>
          )
        }
      </AsyncContent>
    </>
  );
}

function sortByBodyPart(items: readonly BodyPartSummary[]): BodyPartSummary[] {
  return [...items].sort(
    (a, b) => BODY_PART_ORDER.indexOf(a.bodyPart) - BODY_PART_ORDER.indexOf(b.bodyPart),
  );
}
