import type { BodyPartSummary, CatalogSearchFilters, Locale } from '@gymbuddy/shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { MIN_SEARCH_LENGTH, useBodyParts, useCatalogSearch } from '../../api/queries';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import {
  Badge,
  Button,
  CatalogCredit,
  Notice,
  SearchField,
  SkeletonList,
  Surface,
  listEntranceProps,
} from '../../components/index';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { CreateExerciseSheet } from '../exercises/CreateExerciseSheet';
import { suggestedExerciseName } from '../exercises/custom-exercise';
import { CatalogExerciseList } from './CatalogExerciseList';
import { CatalogFilterBar } from './CatalogFilterBar';
import {
  applyCatalogFiltersToParams,
  describeCatalogFilters,
  hasCatalogFilters,
  parseCatalogSearchFilters,
} from './filters';
import { bodyPartLabel, BODY_PART_ORDER } from './labels';
import { readSearchQuery, searchBackLink, withSearchQuery } from './navigation';
import { bodyPartPath } from './paths';
import styles from './CatalogScreen.module.css';
import { plural, t, useLocale } from '../../i18n/index';

/** Lo que se espera desde la última tecla antes de buscar: una pausa, no una petición por letra. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Entrada al catálogo: buscador arriba y, debajo, las siete partes del cuerpo. Los filtros salen
 * solo mientras se busca —la lista de partes no se filtra— y se conservan al cambiar el texto.
 * Texto y filtros viven en la URL (`/catalog?q=…`): la ficha de un ejercicio vuelve a la búsqueda
 * tal cual estaba, y la pestaña «Catálogo» la vacía.
 */
export function CatalogScreen() {
  const locale = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = readSearchQuery(searchParams);
  const filters = parseCatalogSearchFilters(searchParams);
  const term = useDebouncedValue(query, SEARCH_DEBOUNCE_MS).trim();
  const searching = term.length >= MIN_SEARCH_LENGTH;

  // Se reemplaza la entrada del historial: «atrás» no recorre letra a letra ni filtro a filtro. El
  // texto va con `flushSync` porque el campo lo pinta la URL, y en una transición se quedaría atrás.
  const changeQuery = (next: string): void => {
    setSearchParams((current) => withSearchQuery(current, next), {
      replace: true,
      flushSync: true,
    });
  };
  const changeFilters = (next: CatalogSearchFilters): void => {
    setSearchParams((current) => applyCatalogFiltersToParams(current, next), { replace: true });
  };

  return (
    <>
      <ScreenHeader
        title={t('Catálogo', 'Catalogue')}
        subtitle={t(
          'Busca un ejercicio o elige una parte del cuerpo',
          'Search for an exercise or pick a body part',
        )}
      />
      <div className={styles.search}>
        <SearchField
          value={query}
          onChange={changeQuery}
          label={t('Buscar ejercicio', 'Search exercise')}
          placeholder={t('press banca, curl, sentadilla…', 'bench press, curl, squat…')}
        />
      </div>
      {searching ? (
        <>
          <div className={styles.search}>
            <CatalogFilterBar filters={filters} bodyPart={null} onChange={changeFilters} />
          </div>
          <SearchResults
            term={term}
            locale={locale}
            filters={filters}
            onClearFilters={() => {
              changeFilters({});
            }}
          />
        </>
      ) : (
        <BodyPartList locale={locale} />
      )}
    </>
  );
}

interface SearchResultsProps {
  readonly term: string;
  readonly locale: Locale | undefined;
  readonly filters: CatalogSearchFilters;
  readonly onClearFilters: () => void;
}

function SearchResults({ term, locale, filters, onClearFilters }: SearchResultsProps) {
  const results = useCatalogSearch(term, locale, filters);
  const filtered = hasCatalogFilters(filters);
  // El nombre se fija al pulsar y no se lee de `term` mientras la hoja está abierta: el buscador
  // sigue vivo detrás, y teclear en él no debe reescribir lo que se está creando.
  const [creatingName, setCreatingName] = useState<string | null>(null);
  const openCreate = (): void => {
    setCreatingName(suggestedExerciseName(term));
  };
  const createLabel = t(
    `Crear «${suggestedExerciseName(term)}»`,
    `Create “${suggestedExerciseName(term)}”`,
  );

  return (
    <>
      <AsyncContent query={results} skeleton={<SkeletonList rows={4} thumb />}>
        {(items) =>
          items.length === 0 && filtered ? (
            <Notice
              title={t(
                `Nada que se llame «${term}» con «${describeCatalogFilters(filters)}»`,
                `Nothing called “${term}” with “${describeCatalogFilters(filters)}”`,
              )}
              action={
                <div className={styles.noticeActions}>
                  <Button variant="secondary" onClick={onClearFilters}>
                    {t('Quitar filtros', 'Clear filters')}
                  </Button>
                  <Button variant="ghost" onClick={openCreate}>
                    {createLabel}
                  </Button>
                </div>
              }
            >
              {t(
                'Los filtros dejan fuera todo lo que casa con la búsqueda. Quítalos para ver el resto, o créalo como ejercicio propio.',
                'The filters leave out everything that matches the search. Clear them to see the rest, or create it as your own exercise.',
              )}
            </Notice>
          ) : items.length === 0 ? (
            <Notice
              title={t(`Nada que se llame «${term}»`, `Nothing called “${term}”`)}
              action={
                <Button variant="secondary" onClick={openCreate}>
                  {createLabel}
                </Button>
              }
            >
              {t(
                'La búsqueda ignora los acentos y exige todas las palabras. Prueba con menos, o créalo como ejercicio propio si tu gimnasio tiene algo que el catálogo no.',
                'Search ignores accents and needs every word to match. Try fewer words, or create it as your own exercise if your gym has something the catalogue doesn’t.',
              )}
            </Notice>
          ) : (
            <div className={styles.results}>
              <CatalogExerciseList items={items} backTo={searchBackLink(term, filters)} />
              <div className={styles.createOwn}>
                <p className={styles.createOwnText}>
                  {t('¿No es ninguno de estos?', 'None of these?')}
                </p>
                <Button variant="ghost" onClick={openCreate}>
                  {createLabel}
                </Button>
              </div>
            </div>
          )
        }
      </AsyncContent>

      <CreateExerciseSheet
        open={creatingName !== null}
        initialName={creatingName ?? ''}
        onClose={() => {
          setCreatingName(null);
        }}
      />
    </>
  );
}

function BodyPartList({ locale }: { readonly locale: Locale | undefined }) {
  const bodyParts = useBodyParts(locale);

  return (
    <AsyncContent query={bodyParts} skeleton={<SkeletonList rows={BODY_PART_ORDER.length} />}>
      {(items) =>
        items.length === 0 ? (
          <Notice
            title={t(
              'El catálogo todavía se está preparando',
              'The catalogue is still being prepared',
            )}
          >
            {t(
              'Se sincroniza por partes en segundo plano. Vuelve en unos minutos.',
              'It syncs in parts in the background. Come back in a few minutes.',
            )}
          </Notice>
        ) : (
          // El crédito va al pie de la entrada al catálogo, que es la pantalla desde la que se
          // llega a todos los GIFs de terceros (ADR 0001). No se repite en cada ficha.
          <>
            <ul className={styles.list}>
              {sortByBodyPart(items).map((item, index) => (
                <Surface as="li" key={item.bodyPart} padding="none" {...listEntranceProps(index)}>
                  <Link to={bodyPartPath(item.bodyPart)} className={styles.row}>
                    <span className={styles.name}>{bodyPartLabel(item.bodyPart)}</span>
                    <Badge>
                      {plural(
                        item.exerciseCount,
                        ['ejercicio', 'ejercicios'],
                        ['exercise', 'exercises'],
                      )}
                    </Badge>
                  </Link>
                </Surface>
              ))}
            </ul>
            <CatalogCredit />
          </>
        )
      }
    </AsyncContent>
  );
}

function sortByBodyPart(items: readonly BodyPartSummary[]): BodyPartSummary[] {
  return [...items].sort(
    (a, b) => BODY_PART_ORDER.indexOf(a.bodyPart) - BODY_PART_ORDER.indexOf(b.bodyPart),
  );
}
