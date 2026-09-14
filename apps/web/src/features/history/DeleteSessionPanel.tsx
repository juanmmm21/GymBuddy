import type { ResourceId } from '@gymbuddy/shared';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useDeleteSession } from '../../api/mutations';
import { Button, Notice } from '../../components/index';
import { describeError } from '../../lib/errors';
import { pluralize } from '../../lib/format';
import { hasPendingWritesForSession } from '../../offline/overlay';
import { useUserWriteQueue } from '../../offline/WriteQueueProvider';
import styles from './DeleteSessionPanel.module.css';
import { HISTORY_PATH } from './paths';

export interface DeleteSessionPanelProps {
  readonly sessionId: ResourceId;
  /** Las series efectivas, para decir en la confirmación qué se va. */
  readonly workingSetCount: number;
}

/**
 * Borrar un entrenamiento cerrado, al pie de su detalle. Pide confirmación en la misma pantalla y
 * no con `window.confirm`: un diálogo del navegador no lleva el diseño ni se puede probar, y aquí
 * un toque de más se lleva un día entero de series.
 */
export function DeleteSessionPanel({ sessionId, workingSetCount }: DeleteSessionPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteSession();
  const navigate = useNavigate();
  const { pending } = useUserWriteQueue();
  const waitingToSync = useMemo(
    () =>
      hasPendingWritesForSession(
        pending.map((entry) => entry.write),
        sessionId,
      ),
    [pending, sessionId],
  );

  const handleDelete = (): void => {
    remove.mutate(sessionId, {
      // Con `replace`: volver atrás desde el historial no puede llevar a una sesión que ya no existe.
      onSuccess: () => {
        void navigate(HISTORY_PATH, { replace: true });
      },
    });
  };

  if (waitingToSync) {
    return (
      <section className={styles.panel} aria-label="Borrar entrenamiento">
        <p className={styles.hint}>
          Hay cambios de este entrenamiento sin sincronizar. Podrás borrarlo cuando lleguen.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="Borrar entrenamiento">
      {remove.isError && (
        <Notice tone="danger" title="No se pudo borrar">
          {describeError(remove.error)}
        </Notice>
      )}

      {confirming ? (
        <Notice
          tone="warning"
          title="¿Borrar este entrenamiento?"
          action={
            <div className={styles.actions}>
              <Button variant="danger" loading={remove.isPending} onClick={handleDelete}>
                Sí, borrarlo
              </Button>
              <Button
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => {
                  setConfirming(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          }
        >
          {workingSetCount === 0
            ? 'Desaparece de tu historial. No se puede deshacer.'
            : `Desaparece de tu historial, y con él ${pluralize(workingSetCount, 'serie', 'series')}. Si alguna tenía un récord, pasa a la mejor serie que viniera después. No se puede deshacer.`}
        </Notice>
      ) : (
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            setConfirming(true);
          }}
        >
          Borrar entrenamiento
        </Button>
      )}
    </section>
  );
}
