import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describeError } from '../../lib/errors';
import { Button } from '../button/Button';
import { Notice } from '../notice/Notice';
import { Spinner } from '../spinner/Spinner';
import styles from './AsyncContent.module.css';

export interface AsyncContentProps<T> {
  readonly query: UseQueryResult<T>;
  readonly children: (data: T) => ReactNode;
  /**
   * Si una relectura fallida se calla. Para una consulta anidada dentro de otra que ya lo avisa:
   * en la sesión sin red, dos avisos iguales seguidos no cuentan nada más que uno.
   */
  readonly quietRefetchError?: boolean;
  /**
   * Lo que se pinta mientras carga, con la forma de lo que viene (ver `SkeletonList`). Sin él, el
   * spinner de siempre: vale para un bloque suelto, pero delante de una lista salta demasiado.
   * Quien lo pase se encarga de anunciar la espera; el spinner ya lo hace por su cuenta.
   */
  readonly skeleton?: ReactNode;
}

/**
 * Los tres estados de una consulta, resueltos una sola vez: cargando, fallo con reintento
 * y datos. Así ninguna pantalla se olvida del error y aparece en blanco.
 *
 * Con datos, los datos mandan aunque la relectura falle: sin red, la sesión abierta tiene que
 * seguir viéndose con lo último que llegó o que se guardó en el móvil, no convertirse en un
 * error. El fallo se cuenta encima, en pequeño, con su reintento.
 */
export function AsyncContent<T>({
  query,
  children,
  quietRefetchError = false,
  skeleton,
}: AsyncContentProps<T>) {
  if (query.data !== undefined) {
    return (
      <>
        {query.isError && !quietRefetchError && (
          <div className={styles.stale}>
            <Notice
              tone="warning"
              title="Sin actualizar: ves lo último que se cargó"
              action={<RetryButton query={query} />}
            >
              {describeError(query.error)}
            </Notice>
          </div>
        )}
        {children(query.data)}
      </>
    );
  }

  if (query.isPending) {
    if (skeleton !== undefined) return <>{skeleton}</>;
    return (
      <div className={styles.loading}>
        <Spinner />
      </div>
    );
  }

  if (query.isError) {
    return (
      <Notice tone="danger" title="No se pudo cargar" action={<RetryButton query={query} />}>
        {describeError(query.error)}
      </Notice>
    );
  }

  return <>{children(query.data)}</>;
}

function RetryButton<T>({ query }: { readonly query: UseQueryResult<T> }) {
  return (
    <Button
      variant="secondary"
      loading={query.isFetching}
      onClick={() => {
        void query.refetch();
      }}
    >
      Reintentar
    </Button>
  );
}
