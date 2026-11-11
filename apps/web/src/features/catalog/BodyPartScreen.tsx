import type { BodyPart, CatalogFilters } from '@gymbuddy/shared';
import { useParams, useSearchParams } from 'react-router';
import { useCatalogExercises } from '../../api/queries';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Button, Notice, SkeletonList } from '../../components/index';
import { CatalogExerciseList } from './CatalogExerciseList';
import { CatalogFilterBar } from './CatalogFilterBar';
import {
  applyCatalogFiltersToParams,
  describeCatalogFilters,
  hasCatalogFilters,
  parseCatalogFilters,
} from './filters';
import { bodyPartLabel } from './labels';
import { bodyPartBackLink } from './navigation';
import { CATALOG_PATH, parseBodyPart } from './paths';
import styles from './BodyPartScreen.module.css';
import { plural, t, useLocale } from '../../i18n/index';

function backToCatalog(): BackLink {
  return { to: CATALOG_PATH, label: t('Catálogo', 'Catalogue') };
}

/**
 * Los ejercicios de una parte del cuerpo (`/catalog/:bodyPart`), de cincuenta en cincuenta. Los
 * filtros viven en la URL y la ficha de un ejercicio vuelve a ella con los filtros puestos.
 */
export function BodyPartScreen() {
  const params = useParams();
  const bodyPart = parseBodyPart(params['bodyPart']);

  if (bodyPart === null) {
    return (
      <>
        <ScreenHeader title={t('Catálogo', 'Catalogue')} backTo={backToCatalog()} />
        <Notice
          tone="danger"
          title={t('No existe esa parte del cuerpo', 'That body part doesn’t exist')}
        >
          {t(
            'El catálogo se navega por pecho, espalda, piernas, hombros, brazos, core y cardio.',
            'The catalogue is organised by chest, back, legs, shoulders, arms, core and cardio.',
          )}
        </Notice>
      </>
    );
  }

  return <BodyPartExercises bodyPart={bodyPart} />;
}

function BodyPartExercises({ bodyPart }: { readonly bodyPart: BodyPart }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseCatalogFilters(searchParams, bodyPart);
  const query = useCatalogExercises(bodyPart, useLocale(), filters);
  const total = query.data?.pages[0]?.total;
  // Se reemplaza la entrada del historial: «atrás» vuelve al catálogo, no al filtro anterior.
  const changeFilters = (next: CatalogFilters): void => {
    setSearchParams((current) => applyCatalogFiltersToParams(current, next), { replace: true });
  };

  return (
    <>
      <ScreenHeader
        title={bodyPartLabel(bodyPart)}
        subtitle={
          total === undefined
            ? undefined
            : plural(total, ['ejercicio', 'ejercicios'], ['exercise', 'exercises'])
        }
        backTo={backToCatalog()}
      />
      <div className={styles.filters}>
        <CatalogFilterBar filters={filters} bodyPart={bodyPart} onChange={changeFilters} />
      </div>
      <AsyncContent query={query} skeleton={<SkeletonList rows={6} thumb />}>
        {(data) => {
          const items = data.pages.flatMap((page) => page.items);
          if (items.length === 0 && hasCatalogFilters(filters)) {
            return (
              <Notice
                title={t(
                  `Nada con «${describeCatalogFilters(filters)}»`,
                  `Nothing with “${describeCatalogFilters(filters)}”`,
                )}
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      changeFilters({});
                    }}
                  >
                    {t('Quitar filtros', 'Clear filters')}
                  </Button>
                }
              >
                {t(
                  `Con estos filtros no queda ningún ejercicio de ${bodyPartLabel(bodyPart).toLowerCase()}. Prueba con otro equipamiento o quitando alguno.`,
                  `No ${bodyPartLabel(bodyPart).toLowerCase()} exercises are left with these filters. Try other equipment or remove some.`,
                )}
              </Notice>
            );
          }
          if (items.length === 0) {
            return (
              <Notice title={t('Aquí no hay ejercicios todavía', 'No exercises here yet')}>
                {t(
                  'El catálogo se sincroniza por partes en segundo plano. Vuelve en unos minutos.',
                  'The catalogue syncs in parts in the background. Come back in a few minutes.',
                )}
              </Notice>
            );
          }

          return (
            <div className={styles.stack}>
              <CatalogExerciseList items={items} backTo={bodyPartBackLink(bodyPart, filters)} />
              {query.hasNextPage ? (
                <Button
                  variant="secondary"
                  fullWidth
                  loading={query.isFetchingNextPage}
                  onClick={() => {
                    void query.fetchNextPage();
                  }}
                >
                  {t('Cargar más', 'Load more')}
                </Button>
              ) : (
                <p className={styles.end}>
                  {t('Eso es todo:', 'That’s all:')}{' '}
                  {plural(items.length, ['ejercicio', 'ejercicios'], ['exercise', 'exercises'])}
                </p>
              )}
            </div>
          );
        }}
      </AsyncContent>
    </>
  );
}
