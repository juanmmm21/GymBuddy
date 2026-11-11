import {
  MAX_ROUTINE_DESCRIPTION_LENGTH,
  MAX_ROUTINE_NAME_LENGTH,
  routineNameSchema,
  type Routine,
} from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { useUpdateRoutine } from '../../api/mutations';
import { Button, Notice, Sheet, TextArea, TextField } from '../../components/index';
import { describeError } from '../../lib/errors';
import { normalizeNotes } from '../../lib/notes';
import { DeleteRoutinePanel } from './DeleteRoutinePanel';
import styles from './EditRoutineSheet.module.css';
import { t } from '../../i18n/index';

export interface EditRoutineSheetProps {
  readonly routine: Routine;
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * Nombre, descripción y archivado de una rutina. Los ejercicios no pasan por aquí: se
 * editan en la propia pantalla, línea a línea. El formulario solo existe mientras la hoja
 * está abierta, así que cada apertura arranca con lo guardado.
 */
export function EditRoutineSheet({ routine, open, onClose }: EditRoutineSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={t('Editar rutina', 'Edit routine')}>
      <div className={styles.content}>
        <EditRoutineForm routine={routine} onDone={onClose} />
        <DeleteRoutinePanel routine={routine} />
      </div>
    </Sheet>
  );
}

interface EditRoutineFormProps {
  readonly routine: Routine;
  readonly onDone: () => void;
}

function EditRoutineForm({ routine, onDone }: EditRoutineFormProps) {
  const [name, setName] = useState(routine.name);
  const [description, setDescription] = useState(routine.description ?? '');
  const update = useUpdateRoutine();
  const archived = routine.archivedAt !== null;
  const validName = routineNameSchema.safeParse(name).success;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!validName) return;

    // Sin `items`: el Worker deja la lista como está, y así guardar el nombre no puede
    // pisar un reordenado que otra pantalla acabe de mandar.
    update.mutate(
      {
        routineId: routine.id,
        body: { name: name.trim(), description: normalizeNotes(description) },
      },
      { onSuccess: onDone },
    );
  };

  const toggleArchived = (): void => {
    update.mutate({ routineId: routine.id, body: { archived: !archived } }, { onSuccess: onDone });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <TextField
        label={t('Nombre', 'Name')}
        value={name}
        onChange={setName}
        maxLength={MAX_ROUTINE_NAME_LENGTH}
      />

      <TextArea
        label={t('Descripción', 'Description')}
        value={description}
        onChange={setDescription}
        maxLength={MAX_ROUTINE_DESCRIPTION_LENGTH}
        rows={3}
        placeholder={t(
          'Qué días la haces o en qué te fijas. Opcional.',
          'Which days you do it or what you focus on. Optional.',
        )}
      />

      {update.isError && (
        <Notice tone="danger" title={t('No se pudo guardar', 'Couldn’t save')}>
          {describeError(update.error)}
        </Notice>
      )}

      <Button type="submit" size="lg" fullWidth loading={update.isPending} disabled={!validName}>
        {t('Guardar', 'Save')}
      </Button>

      <div className={styles.archive}>
        <Button
          variant={archived ? 'secondary' : 'danger'}
          fullWidth
          disabled={update.isPending}
          onClick={toggleArchived}
        >
          {archived
            ? t('Recuperar rutina', 'Restore routine')
            : t('Archivar rutina', 'Archive routine')}
        </Button>
        <p className={styles.archiveHint}>
          {archived
            ? t(
                'Vuelve a tu lista de rutinas con sus ejercicios.',
                'It comes back to your routines with its exercises.',
              )
            : t(
                'Desaparece de tu lista. Tus ejercicios y su historial no se tocan.',
                'It disappears from your list. Your exercises and their history aren’t touched.',
              )}
        </p>
      </div>
    </form>
  );
}
