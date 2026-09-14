import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useCreateTrackedExercise } from '../../api/mutations';
import { Button, Notice, Select, Sheet, TextField } from '../../components/index';
import { describeError } from '../../lib/errors';
import { newResourceId } from '../../lib/ids';
import { MAX_EXERCISE_NAME_LENGTH } from '../../lib/notes';
import {
  bodyPartSelectOptions,
  muscleSelectOptions,
  parseDraftBodyPart,
  reconcileMuscle,
  toCustomExerciseRequest,
  UNSELECTED,
  type CustomExerciseDraft,
} from './custom-exercise';
import { trackedExercisePath } from './paths';
import styles from './CreateExerciseSheet.module.css';

export interface CreateExerciseSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** El nombre con el que arranca: lo que se buscó en el catálogo sin encontrarlo, o nada. */
  readonly initialName?: string;
}

/**
 * Alta de un ejercicio propio, para lo que el catálogo no tiene (una máquina concreta de tu
 * gimnasio, una variante en polea). Sin GIF: solo nombre, parte del cuerpo y, si se quiere, el
 * músculo. Al crearlo se abre su ficha, que es donde se ven sus series y se editan las notas.
 */
export function CreateExerciseSheet({ open, onClose, initialName = '' }: CreateExerciseSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Nuevo ejercicio propio">
      <CreateExerciseForm initialName={initialName} />
    </Sheet>
  );
}

function CreateExerciseForm({ initialName }: { readonly initialName: string }) {
  // El identificador se fija al abrir la hoja y no al pulsar: si el alta llegó al Worker y se
  // perdió la respuesta, reintentar manda el mismo id y vuelve la ficha ya creada, no otra igual.
  const [exerciseId] = useState(newResourceId);
  const [draft, setDraft] = useState<CustomExerciseDraft>({
    name: initialName,
    bodyPart: UNSELECTED,
    muscle: UNSELECTED,
  });
  const create = useCreateTrackedExercise();
  const navigate = useNavigate();
  const bodyPart = parseDraftBodyPart(draft.bodyPart);
  const request = toCustomExerciseRequest(exerciseId, draft);

  const changeBodyPart = (value: string): void => {
    setDraft((current) => ({
      ...current,
      bodyPart: value,
      muscle: reconcileMuscle(current.muscle, parseDraftBodyPart(value)),
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (request === null) return;

    create.mutate(request, {
      onSuccess: (exercise) => {
        void navigate(trackedExercisePath(exercise.id));
      },
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <TextField
        label="Nombre"
        value={draft.name}
        onChange={(name) => {
          setDraft((current) => ({ ...current, name }));
        }}
        maxLength={MAX_EXERCISE_NAME_LENGTH}
        placeholder="Hip thrust en máquina, step up en polea…"
        hint="Como aparece en la máquina o como lo llamas tú."
      />

      <Select
        label="Parte del cuerpo"
        value={draft.bodyPart}
        onChange={changeBodyPart}
        options={bodyPartSelectOptions()}
        hint="Decide en qué grupo sale y cómo cuenta en tu semana."
      />

      <Select
        label="Músculo"
        value={draft.muscle}
        onChange={(muscle) => {
          setDraft((current) => ({ ...current, muscle }));
        }}
        options={muscleSelectOptions(bodyPart)}
        disabled={bodyPart === null}
        hint="Opcional."
      />

      <p className={styles.note}>
        Un ejercicio propio no lleva animación; sus series, marcas y gráfica funcionan igual.
      </p>

      {create.isError && (
        <Notice tone="danger" title="No se pudo crear">
          {describeError(create.error)}
        </Notice>
      )}

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={create.isPending}
        disabled={request === null}
      >
        Crear ejercicio
      </Button>
    </form>
  );
}
