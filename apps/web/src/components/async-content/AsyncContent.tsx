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
}

/**
 * Los tres estados de una consulta, resueltos una sola vez: cargando, fallo con reintento
 * y datos. Así ninguna pantalla se olvida del error y aparece en blanco.
 */
export function AsyncContent<T>({ query, children }: AsyncContentProps<T>) {
  if (query.isPending) {
    return (
      <div className={styles.loading}>
        <Spinner />
      </div>
    );
  }

  if (query.isError) {
    return (
      <Notice
        tone="danger"
        title="No se pudo cargar"
        action={
          <Button
            variant="secondary"
            loading={query.isFetching}
            onClick={() => {
              void query.refetch();
            }}
          >
            Reintentar
          </Button>
        }
      >
        {describeError(query.error)}
      </Notice>
    );
  }

  return <>{children(query.data)}</>;
}
