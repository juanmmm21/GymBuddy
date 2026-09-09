import type { TrackedExercise } from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { useUpdateTrackedExercise } from '../../api/mutations';
import { Button, Notice, Sheet, TextArea, TextField } from '../../components/index';
import { describeError } from '../../lib/errors';
import {
  MAX_EXERCISE_NAME_LENGTH,
  MAX_EXERCISE_NOTES_LENGTH,
  normalizeNotes,
} from '../../lib/notes';
import styles from './EditExerciseSheet.module.css';

export interface EditExerciseSheetProps {
  readonly exercise: TrackedExercise;
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * Editar un ejercicio seguido: su nombre —solo si es propio—, sus notas y si está
 * archivado. El formulario va dentro de la hoja, que solo monta su contenido mientras está
 * abierta: cada apertura arranca con lo guardado y sin restos de un intento anterior.
 */
export function EditExerciseSheet({ exercise, open, onClose }: EditExerciseSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Editar ejercicio">
      <EditExerciseForm exercise={exercise} onDone={onClose} />
    </Sheet>
  );
}

interface EditExerciseFormProps {
  readonly exercise: TrackedExercise;
  readonly onDone: () => void;
}

function EditExerciseForm({ exercise, onDone }: EditExerciseFormProps) {
  const [name, setName] = useState(exercise.name);
  const [notes, setNotes] = useState(exercise.notes ?? '');
  const update = useUpdateTrackedExercise();
  const archived = exercise.archivedAt !== null;
  // El nombre de uno del catálogo viene del catálogo, y el Worker rechaza cambiarlo.
  const renamable = exercise.origin === 'custom';
  const trimmedName = name.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (renamable && trimmedName === '') return;

    update.mutate(
      {
        exerciseId: exercise.id,
        body: renamable
          ? { name: trimmedName, notes: normalizeNotes(notes) }
          : { notes: normalizeNotes(notes) },
      },
      { onSuccess: onDone },
    );
  };

  const toggleArchived = (): void => {
    update.mutate(
      { exerciseId: exercise.id, body: { archived: !archived } },
      { onSuccess: onDone },
    );
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {renamable && (
        <TextField
          label="Nombre"
          value={name}
          onChange={setName}
          maxLength={MAX_EXERCISE_NAME_LENGTH}
          hint="Como lo llamas tú. Su historial y sus marcas no se mueven."
        />
      )}

      <TextArea
        label="Notas"
        value={notes}
        onChange={setNotes}
        maxLength={MAX_EXERCISE_NOTES_LENGTH}
        placeholder="Agarre, altura del asiento, lo que quieras recordar la próxima vez."
      />

      {update.isError && (
        <Notice tone="danger" title="No se pudo guardar">
          {describeError(update.error)}
        </Notice>
      )}

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={update.isPending}
        disabled={renamable && trimmedName === ''}
      >
        Guardar
      </Button>

      <div className={styles.archive}>
        <Button
          variant={archived ? 'secondary' : 'danger'}
          fullWidth
          disabled={update.isPending}
          onClick={toggleArchived}
        >
          {archived ? 'Recuperar ejercicio' : 'Archivar ejercicio'}
        </Button>
        <p className={styles.archiveHint}>
          {archived
            ? 'Vuelve a tu lista y a la sesión, con todo su historial.'
            : 'Desaparece de tu lista, pero su historial y sus marcas se conservan.'}
        </p>
      </div>
    </form>
  );
}
