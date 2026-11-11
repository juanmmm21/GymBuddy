import type { Routine } from '@gymbuddy/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useDeleteRoutine } from '../../api/mutations';
import { Button, Notice } from '../../components/index';
import { describeError } from '../../lib/errors';
import styles from './DeleteRoutinePanel.module.css';
import { ROUTINES_PATH } from './paths';
import { t, plural } from '../../i18n/index';

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
      ? t('Desaparece del todo.', 'It disappears completely.')
      : t(
          `Desaparece del todo, con ${plural(routine.items.length, ['ejercicio', 'ejercicios'], ['exercise', 'exercises'])} en su orden.`,
          `It disappears completely, with its ${plural(routine.items.length, ['ejercicio', 'ejercicios'], ['exercise', 'exercises'])} in order.`,
        );

  return (
    <section className={styles.panel} aria-label={t('Borrar rutina', 'Delete routine')}>
      {remove.isError && (
        <Notice tone="danger" title={t('No se pudo borrar', 'Couldn’t delete')}>
          {describeError(remove.error)}
        </Notice>
      )}

      {confirming ? (
        <Notice
          tone="warning"
          title={t('¿Borrar esta rutina?', 'Delete this routine?')}
          action={
            <div className={styles.actions}>
              <Button variant="danger" loading={remove.isPending} onClick={handleDelete}>
                {t('Sí, borrarla', 'Yes, delete it')}
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
          {`${whatGoes} ${t(
            'Tus ejercicios y tus entrenamientos no se tocan, y si guía la sesión abierta, la sesión sigue sin guion. No se puede deshacer.',
            'Your exercises and workouts aren’t touched, and if it guides the open session, the session continues without a plan. This can’t be undone.',
          )}`}
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
            {t('Borrar rutina', 'Delete routine')}
          </Button>
          <p className={styles.hint}>
            {t(
              'Si solo quieres quitarla de la lista, archívala.',
              'If you just want it off the list, archive it.',
            )}
          </p>
        </>
      )}
    </section>
  );
}
