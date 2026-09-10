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
import styles from './EditRoutineSheet.module.css';

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
    <Sheet open={open} onClose={onClose} title="Editar rutina">
      <EditRoutineForm routine={routine} onDone={onClose} />
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
        label="Nombre"
        value={name}
        onChange={setName}
        maxLength={MAX_ROUTINE_NAME_LENGTH}
      />

      <TextArea
        label="Descripción"
        value={description}
        onChange={setDescription}
        maxLength={MAX_ROUTINE_DESCRIPTION_LENGTH}
        rows={3}
        placeholder="Qué días la haces o en qué te fijas. Opcional."
      />

      {update.isError && (
        <Notice tone="danger" title="No se pudo guardar">
          {describeError(update.error)}
        </Notice>
      )}

      <Button type="submit" size="lg" fullWidth loading={update.isPending} disabled={!validName}>
        Guardar
      </Button>

      <div className={styles.archive}>
        <Button
          variant={archived ? 'secondary' : 'danger'}
          fullWidth
          disabled={update.isPending}
          onClick={toggleArchived}
        >
          {archived ? 'Recuperar rutina' : 'Archivar rutina'}
        </Button>
        <p className={styles.archiveHint}>
          {archived
            ? 'Vuelve a tu lista de rutinas con sus ejercicios.'
            : 'Desaparece de tu lista. Tus ejercicios y su historial no se tocan.'}
        </p>
      </div>
    </form>
  );
}
