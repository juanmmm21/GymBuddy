import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useCreateTrackedExercise } from '../../api/mutations';
import { Button, Notice, Select, Sheet, Switch, TextField } from '../../components/index';
import { describeError } from '../../lib/errors';
import { newResourceId } from '../../lib/ids';
import { MAX_EXERCISE_NAME_LENGTH } from '../../lib/notes';
import {
  bodyPartSelectOptions,
  muscleSelectOptions,
  offersUnilateral,
  parseDraftBodyPart,
  reconcileMuscle,
  toCustomExerciseRequest,
  UNSELECTED,
  type CustomExerciseDraft,
} from './custom-exercise';
import { unilateralHint } from './labels';
import { trackedExercisePath } from './paths';
import styles from './CreateExerciseSheet.module.css';
import { t } from '../../i18n/index';

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
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Nuevo ejercicio propio', 'New exercise of your own')}
    >
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
    unilateral: false,
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
        label={t('Nombre', 'Name')}
        value={draft.name}
        onChange={(name) => {
          setDraft((current) => ({ ...current, name }));
        }}
        maxLength={MAX_EXERCISE_NAME_LENGTH}
        placeholder={t(
          'Hip thrust en máquina, step up en polea…',
          'Machine hip thrust, cable step-up…',
        )}
        hint={t(
          'Como aparece en la máquina o como lo llamas tú.',
          'As it says on the machine, or what you call it.',
        )}
      />

      <Select
        label={t('Parte del cuerpo', 'Body part')}
        value={draft.bodyPart}
        onChange={changeBodyPart}
        options={bodyPartSelectOptions()}
        hint={t(
          'Decide en qué grupo sale y cómo cuenta en tu semana.',
          'Decides which group it shows in and how it counts in your week.',
        )}
      />

      <Select
        label={t('Músculo', 'Muscle')}
        value={draft.muscle}
        onChange={(muscle) => {
          setDraft((current) => ({ ...current, muscle }));
        }}
        options={muscleSelectOptions(bodyPart)}
        disabled={bodyPart === null}
        hint={t('Opcional.', 'Optional.')}
      />

      {offersUnilateral(bodyPart) && (
        <Switch
          label={t('A un brazo', 'One arm')}
          checked={draft.unilateral}
          onChange={(unilateral) => {
            setDraft((current) => ({ ...current, unilateral }));
          }}
          hint={unilateralHint()}
        />
      )}

      <p className={styles.note}>
        {t(
          'Un ejercicio propio no lleva animación; sus series, marcas y gráfica funcionan igual.',
          'Your own exercise has no animation; its sets, records and chart work the same.',
        )}
      </p>

      {create.isError && (
        <Notice tone="danger" title={t('No se pudo crear', 'Couldn’t create it')}>
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
        {t('Crear ejercicio', 'Create exercise')}
      </Button>
    </form>
  );
}
