import type { ResourceId } from '@gymbuddy/shared';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useDeleteSession } from '../../api/mutations';
import { Button, Notice } from '../../components/index';
import { describeError } from '../../lib/errors';
import { hasPendingWritesForSession } from '../../offline/overlay';
import { useUserWriteQueue } from '../../offline/WriteQueueProvider';
import styles from './DeleteSessionPanel.module.css';
import { HISTORY_PATH } from './paths';
import { t, plural } from '../../i18n/index';

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
      <section className={styles.panel} aria-label={t('Borrar entrenamiento', 'Delete workout')}>
        <p className={styles.hint}>
          {t(
            'Hay cambios de este entrenamiento sin sincronizar. Podrás borrarlo cuando lleguen.',
            'This workout has unsynced changes. You can delete it once they arrive.',
          )}
        </p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label={t('Borrar entrenamiento', 'Delete workout')}>
      {remove.isError && (
        <Notice tone="danger" title={t('No se pudo borrar', 'Couldn’t delete')}>
          {describeError(remove.error)}
        </Notice>
      )}

      {confirming ? (
        <Notice
          tone="warning"
          title={t('¿Borrar este entrenamiento?', 'Delete this workout?')}
          action={
            <div className={styles.actions}>
              <Button variant="danger" loading={remove.isPending} onClick={handleDelete}>
                {t('Sí, borrarlo', 'Yes, delete it')}
              </Button>
              <Button
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => {
                  setConfirming(false);
                }}
              >
                {t('Cancelar', 'Cancel')}
              </Button>
            </div>
          }
        >
          {workingSetCount === 0
            ? t(
                'Desaparece de tu historial. No se puede deshacer.',
                'It disappears from your history. This can’t be undone.',
              )
            : t(
                `Desaparece de tu historial, y con él ${plural(workingSetCount, ['serie', 'series'], ['set', 'sets'])}. Si alguna tenía un récord, pasa a la mejor serie que viniera después. No se puede deshacer.`,
                `It disappears from your history, along with ${plural(workingSetCount, ['serie', 'series'], ['set', 'sets'])}. If any held a record, it passes to the best set that came after. This can’t be undone.`,
              )}
        </Notice>
      ) : (
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            setConfirming(true);
          }}
        >
          {t('Borrar entrenamiento', 'Delete workout')}
        </Button>
      )}
    </section>
  );
}
