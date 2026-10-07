import type { TrackedExercise, UpdateTrackedExerciseRequest } from '@gymbuddy/shared';
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
 * Editar un ejercicio seguido: su nombre, sus notas y si está archivado. El formulario va dentro
 * de la hoja, que solo monta su contenido mientras está abierta: cada apertura arranca con lo
 * guardado y sin restos de un intento anterior.
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
  const fromCatalog = exercise.origin === 'catalog';
  const trimmedName = name.trim();
  // Uno propio no tiene otro nombre al que volver; uno del catálogo, vacío, vuelve al suyo.
  const nameMissing = !fromCatalog && trimmedName === '';

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (nameMissing) return;

    const body: UpdateTrackedExerciseRequest = { notes: normalizeNotes(notes) };
    if (!fromCatalog) {
      body.name = trimmedName;
    } else if (trimmedName !== exercise.name) {
      // Sin tocar no se manda: guardar unas notas no debe fijar el nombre del catálogo como propio.
      body.name = trimmedName === '' ? null : trimmedName;
    }

    update.mutate({ exerciseId: exercise.id, body }, { onSuccess: onDone });
  };

  const toggleArchived = (): void => {
    update.mutate(
      { exerciseId: exercise.id, body: { archived: !archived } },
      { onSuccess: onDone },
    );
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <TextField
        label="Nombre"
        value={name}
        onChange={setName}
        maxLength={MAX_EXERCISE_NAME_LENGTH}
        hint={fromCatalog ? catalogNameHint(exercise) : CUSTOM_NAME_HINT}
      />

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

      <Button type="submit" size="lg" fullWidth loading={update.isPending} disabled={nameMissing}>
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

const CUSTOM_NAME_HINT = 'Como lo llamas tú. Su historial y sus marcas no se mueven.';

/**
 * Bajo el nombre de uno del catálogo: cómo se llama allí —si ya lleva otro— y cómo volver. El
 * nombre del catálogo puede faltar en una ficha guardada en el móvil antes de que existiera.
 */
function catalogNameHint({ name, catalogName }: TrackedExercise): string {
  return catalogName !== null && catalogName !== name
    ? `En el catálogo es «${catalogName}». Déjalo vacío para volver a ese nombre.`
    : 'Ponle el nombre que uses tú. Déjalo vacío para volver al del catálogo.';
}
