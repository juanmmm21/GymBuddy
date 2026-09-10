import {
  MAX_ROUTINE_DESCRIPTION_LENGTH,
  MAX_ROUTINE_NAME_LENGTH,
  routineNameSchema,
} from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useCreateRoutine } from '../../api/mutations';
import { Button, Notice, Sheet, TextArea, TextField } from '../../components/index';
import { describeError } from '../../lib/errors';
import { newResourceId } from '../../lib/ids';
import { normalizeNotes } from '../../lib/notes';
import { routinePath } from './paths';
import styles from './CreateRoutineSheet.module.css';

export interface CreateRoutineSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * Alta de una rutina: solo nombre y descripción. Nace vacía y se lleva al editor, que es
 * donde se añaden y se ordenan los ejercicios; pedirlos aquí sería un segundo editor.
 */
export function CreateRoutineSheet({ open, onClose }: CreateRoutineSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Nueva rutina">
      <CreateRoutineForm />
    </Sheet>
  );
}

function CreateRoutineForm() {
  // El identificador se fija al abrir la hoja y no al pulsar: si el alta llegó al Worker y
  // se perdió la respuesta, reintentar manda el mismo id y vuelve la rutina que ya existe
  // en vez de crear otra igual.
  const [routineId] = useState(newResourceId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useCreateRoutine();
  const navigate = useNavigate();
  const validName = routineNameSchema.safeParse(name).success;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!validName) return;

    create.mutate(
      { id: routineId, name: name.trim(), description: normalizeNotes(description), items: [] },
      {
        onSuccess: (routine) => {
          void navigate(routinePath(routine.id));
        },
      },
    );
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <TextField
        label="Nombre"
        value={name}
        onChange={setName}
        maxLength={MAX_ROUTINE_NAME_LENGTH}
        placeholder="Empuje, Pierna, Torso…"
      />

      <TextArea
        label="Descripción"
        value={description}
        onChange={setDescription}
        maxLength={MAX_ROUTINE_DESCRIPTION_LENGTH}
        rows={3}
        placeholder="Qué días la haces o en qué te fijas. Opcional."
      />

      {create.isError && (
        <Notice tone="danger" title="No se pudo crear">
          {describeError(create.error)}
        </Notice>
      )}

      <Button type="submit" size="lg" fullWidth loading={create.isPending} disabled={!validName}>
        Crear rutina
      </Button>
    </form>
  );
}
