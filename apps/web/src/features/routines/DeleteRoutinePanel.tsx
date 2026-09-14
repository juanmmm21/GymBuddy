import type { Routine } from '@gymbuddy/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useDeleteRoutine } from '../../api/mutations';
import { Button, Notice } from '../../components/index';
import { describeError } from '../../lib/errors';
import { pluralize } from '../../lib/format';
import styles from './DeleteRoutinePanel.module.css';
import { ROUTINES_PATH } from './paths';

export interface DeleteRoutinePanelProps {
  readonly routine: Routine;
}

/**
 * Borrar la rutina del todo, al pie de su hoja de edición y por debajo de archivar, que es lo que
 * se recupera. Confirma en la misma hoja y no con `window.confirm`, igual que borrar un
 * entrenamiento: un diálogo del navegador no lleva el diseño ni se puede probar.
 */
export function DeleteRoutinePanel({ routine }: DeleteRoutinePanelProps) {
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteRoutine();
  const navigate = useNavigate();

  const handleDelete = (): void => {
    remove.mutate(routine.id, {
      // Con `replace`: volver atrás desde la lista no puede llevar a una rutina que ya no existe.
      onSuccess: () => {
        void navigate(ROUTINES_PATH, { replace: true });
      },
    });
  };

  const whatGoes =
    routine.items.length === 0
      ? 'Desaparece del todo.'
      : `Desaparece del todo, con ${pluralize(routine.items.length, 'ejercicio', 'ejercicios')} en su orden.`;

  return (
    <section className={styles.panel} aria-label="Borrar rutina">
      {remove.isError && (
        <Notice tone="danger" title="No se pudo borrar">
          {describeError(remove.error)}
        </Notice>
      )}

      {confirming ? (
        <Notice
          tone="warning"
          title="¿Borrar esta rutina?"
          action={
            <div className={styles.actions}>
              <Button variant="danger" loading={remove.isPending} onClick={handleDelete}>
                Sí, borrarla
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
          {`${whatGoes} Tus ejercicios y tus entrenamientos no se tocan, y si guía la sesión abierta, la sesión sigue sin guion. No se puede deshacer.`}
        </Notice>
      ) : (
        <>
          <Button
            variant="ghost"
            fullWidth
            onClick={() => {
              setConfirming(true);
            }}
          >
            Borrar rutina
          </Button>
          <p className={styles.hint}>Si solo quieres quitarla de la lista, archívala.</p>
        </>
      )}
    </section>
  );
}
