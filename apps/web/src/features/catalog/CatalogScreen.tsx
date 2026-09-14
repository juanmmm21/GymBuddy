import type { BodyPartSummary, CatalogFilters, Locale } from '@gymbuddy/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { MIN_SEARCH_LENGTH, useBodyParts, useCatalogSearch } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Button, Notice, SearchField, Surface } from '../../components/index';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { pluralize } from '../../lib/format';
import { CreateExerciseSheet } from '../exercises/CreateExerciseSheet';
import { suggestedExerciseName } from '../exercises/custom-exercise';
import { CatalogExerciseList } from './CatalogExerciseList';
import { CatalogFilterBar } from './CatalogFilterBar';
import { describeCatalogFilters, hasCatalogFilters } from './filters';
import { BODY_PART_LABELS, BODY_PART_ORDER } from './labels';
import { bodyPartPath } from './paths';
import styles from './CatalogScreen.module.css';

/** Lo que se espera desde la última tecla antes de buscar: una pausa, no una petición por letra. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Entrada al catálogo: buscador arriba y, debajo, las siete partes del cuerpo. Los filtros salen
 * solo mientras se busca —la lista de partes no se filtra— y se conservan al cambiar el texto.
 */
export function CatalogScreen() {
  const { session } = useSession();
  const locale = session?.user.locale;
  const [query, setQuery] = useState('');
  const term = useDebouncedValue(query, SEARCH_DEBOUNCE_MS).trim();
  const searching = term.length >= MIN_SEARCH_LENGTH;
  const [filters, setFilters] = useState<CatalogFilters>({});

  return (
    <>
      <ScreenHeader title="Catálogo" subtitle="Busca un ejercicio o elige una parte del cuerpo" />
      <div className={styles.search}>
        <SearchField
          value={query}
          onChange={setQuery}
          label="Buscar ejercicio"
          placeholder="press banca, curl, sentadilla…"
        />
      </div>
      {searching ? (
        <>
          <div className={styles.search}>
            <CatalogFilterBar filters={filters} bodyPart={null} onChange={setFilters} />
          </div>
          <SearchResults
            term={term}
            locale={locale}
            filters={filters}
            onClearFilters={() => {
              setFilters({});
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
  readonly filters: CatalogFilters;
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
  const createLabel = `Crear «${suggestedExerciseName(term)}»`;

  return (
    <>
      <AsyncContent query={results}>
        {(items) =>
          items.length === 0 && filtered ? (
            <Notice
              title={`Nada que se llame «${term}» con «${describeCatalogFilters(filters)}»`}
              action={
                <div className={styles.noticeActions}>
                  <Button variant="secondary" onClick={onClearFilters}>
                    Quitar filtros
                  </Button>
                  <Button variant="ghost" onClick={openCreate}>
                    {createLabel}
                  </Button>
                </div>
              }
            >
              Los filtros dejan fuera todo lo que casa con la búsqueda. Quítalos para ver el resto,
              o créalo como ejercicio propio.
            </Notice>
          ) : items.length === 0 ? (
            <Notice
              title={`Nada que se llame «${term}»`}
              action={
                <Button variant="secondary" onClick={openCreate}>
                  {createLabel}
                </Button>
              }
            >
              La búsqueda ignora los acentos y exige todas las palabras. Prueba con menos, o créalo
              como ejercicio propio si tu gimnasio tiene algo que el catálogo no.
            </Notice>
          ) : (
            <div className={styles.results}>
              <CatalogExerciseList items={items} />
              <div className={styles.createOwn}>
                <p className={styles.createOwnText}>¿No es ninguno de estos?</p>
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
    <AsyncContent query={bodyParts}>
      {(items) =>
        items.length === 0 ? (
          <Notice title="El catálogo todavía se está preparando">
            Se sincroniza por partes en segundo plano. Vuelve en unos minutos.
          </Notice>
        ) : (
          <ul className={styles.list}>
            {sortByBodyPart(items).map((item) => (
              <Surface as="li" key={item.bodyPart} padding="none">
                <Link to={bodyPartPath(item.bodyPart)} className={styles.row}>
                  <span className={styles.name}>{BODY_PART_LABELS[item.bodyPart]}</span>
                  <Badge>{pluralize(item.exerciseCount, 'ejercicio', 'ejercicios')}</Badge>
                </Link>
              </Surface>
            ))}
          </ul>
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
