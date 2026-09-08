import type { BodyPart } from '@gymbuddy/shared';
import { useParams } from 'react-router';
import { useCatalogExercises } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Button, Notice } from '../../components/index';
import { pluralize } from '../../lib/format';
import { CatalogExerciseList } from './CatalogExerciseList';
import { BODY_PART_LABELS } from './labels';
import { CATALOG_PATH, parseBodyPart } from './paths';
import styles from './BodyPartScreen.module.css';

const BACK_TO_CATALOG: BackLink = { to: CATALOG_PATH, label: 'Catálogo' };

/** Los ejercicios de una parte del cuerpo (`/catalog/:bodyPart`), de cincuenta en cincuenta. */
export function BodyPartScreen() {
  const params = useParams();
  const bodyPart = parseBodyPart(params['bodyPart']);

  if (bodyPart === null) {
    return (
      <>
        <ScreenHeader title="Catálogo" backTo={BACK_TO_CATALOG} />
        <Notice tone="danger" title="No existe esa parte del cuerpo">
          El catálogo se navega por pecho, espalda, piernas, hombros, brazos, core y cardio.
        </Notice>
      </>
    );
  }

  return <BodyPartExercises bodyPart={bodyPart} />;
}

function BodyPartExercises({ bodyPart }: { readonly bodyPart: BodyPart }) {
  const { session } = useSession();
  const query = useCatalogExercises(bodyPart, session?.user.locale);
  const total = query.data?.pages[0]?.total;

  return (
    <>
      <ScreenHeader
        title={BODY_PART_LABELS[bodyPart]}
        subtitle={total === undefined ? undefined : pluralize(total, 'ejercicio', 'ejercicios')}
        backTo={BACK_TO_CATALOG}
      />
      <AsyncContent query={query}>
        {(data) => {
          const items = data.pages.flatMap((page) => page.items);
          if (items.length === 0) {
            return (
              <Notice title="Aquí no hay ejercicios todavía">
                El catálogo se sincroniza por partes en segundo plano. Vuelve en unos minutos.
              </Notice>
            );
          }

          return (
            <div className={styles.stack}>
              <CatalogExerciseList items={items} />
              {query.hasNextPage ? (
                <Button
                  variant="secondary"
                  fullWidth
                  loading={query.isFetchingNextPage}
                  onClick={() => {
                    void query.fetchNextPage();
                  }}
                >
                  Cargar más
                </Button>
              ) : (
                <p className={styles.end}>
                  Eso es todo: {pluralize(items.length, 'ejercicio', 'ejercicios')}
                </p>
              )}
            </div>
          );
        }}
      </AsyncContent>
    </>
  );
}
