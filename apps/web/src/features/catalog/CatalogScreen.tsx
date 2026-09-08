import type { BodyPartSummary, Locale } from '@gymbuddy/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { MIN_SEARCH_LENGTH, useBodyParts, useCatalogSearch } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Notice, SearchField, Surface } from '../../components/index';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { pluralize } from '../../lib/format';
import { CatalogExerciseList } from './CatalogExerciseList';
import { BODY_PART_LABELS, BODY_PART_ORDER } from './labels';
import { bodyPartPath } from './paths';
import styles from './CatalogScreen.module.css';

/** Lo que se espera desde la última tecla antes de buscar: una pausa, no una petición por letra. */
const SEARCH_DEBOUNCE_MS = 250;

/** Entrada al catálogo: buscador arriba y, debajo, las siete partes del cuerpo. */
export function CatalogScreen() {
  const { session } = useSession();
  const locale = session?.user.locale;
  const [query, setQuery] = useState('');
  const term = useDebouncedValue(query, SEARCH_DEBOUNCE_MS).trim();
  const searching = term.length >= MIN_SEARCH_LENGTH;

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
      {searching ? <SearchResults term={term} locale={locale} /> : <BodyPartList locale={locale} />}
    </>
  );
}

interface SearchResultsProps {
  readonly term: string;
  readonly locale: Locale | undefined;
}

function SearchResults({ term, locale }: SearchResultsProps) {
  const results = useCatalogSearch(term, locale);

  return (
    <AsyncContent query={results}>
      {(items) =>
        items.length === 0 ? (
          <Notice title={`Nada que se llame «${term}»`}>
            La búsqueda ignora los acentos y exige todas las palabras. Prueba con menos.
          </Notice>
        ) : (
          <CatalogExerciseList items={items} />
        )
      }
    </AsyncContent>
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
