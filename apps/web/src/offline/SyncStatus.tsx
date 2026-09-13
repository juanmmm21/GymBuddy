import { useState } from 'react';
import { Button, Notice } from '../components/index';
import { describePendingWrites, droppedWriteReason, droppedWriteTitle } from './labels';
import styles from './SyncStatus.module.css';
import { useUserWriteQueue, useWriteQueue } from './WriteQueueProvider';

/**
 * Lo que la cola offline tiene que contar, encima de cualquier pantalla: cuánto espera a que
 * vuelva la red y qué rechazó el Worker al mandarlo tarde. Va arriba del todo porque quien
 * cierra la sesión sin cobertura vuelve a Hoy, y el aviso tiene que seguir viéndose ahí.
 */
export function SyncStatus() {
  const queue = useWriteQueue();
  const { pending, dropped } = useUserWriteQueue();
  const [retrying, setRetrying] = useState(false);

  if (pending.length === 0 && dropped.length === 0) return null;

  const retry = (): void => {
    setRetrying(true);
    void queue.drain().finally(() => {
      setRetrying(false);
    });
  };

  return (
    <div className={styles.stack}>
      {pending.length > 0 && (
        <Notice
          tone="warning"
          title={describePendingWrites(pending.length)}
          action={
            <Button variant="secondary" loading={retrying} onClick={retry}>
              Reintentar ahora
            </Button>
          }
        >
          Está guardado en este móvil y se enviará solo en cuanto haya conexión.
        </Notice>
      )}

      {dropped.map((rejected) => (
        <Notice
          key={rejected.sequence}
          tone="danger"
          title={droppedWriteTitle(rejected.write)}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                queue.dismiss(rejected.sequence);
              }}
            >
              Entendido
            </Button>
          }
        >
          {droppedWriteReason(rejected.error)}
        </Notice>
      ))}
    </div>
  );
}
