import { MAX_DISPLAY_NAME_LENGTH } from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { useUpdateProfile } from '../../api/mutations';
import { Button, Notice, TextField } from '../../components/index';
import { describeError } from '../../lib/errors';
import { displayNameToSave } from './profile-name';
import styles from './ProfileNameForm.module.css';

export interface ProfileNameFormProps {
  /** El nombre guardado en la sesión; el campo arranca con él. */
  readonly currentName: string;
}

/** Cambiar el nombre con el que te saluda la app. */
export function ProfileNameForm({ currentName }: ProfileNameFormProps) {
  const [draft, setDraft] = useState(currentName);
  const update = useUpdateProfile();
  const nameToSave = displayNameToSave(draft, currentName);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (nameToSave === null) return;
    update.mutate(
      { displayName: nameToSave },
      {
        onSuccess: (user) => {
          // El campo enseña lo guardado: sin los espacios que el contrato recortó.
          setDraft(user.displayName);
        },
      },
    );
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <TextField
        label="Nombre"
        value={draft}
        onChange={(value) => {
          setDraft(value);
          // Un aviso de «guardado» o de fallo ya no habla de lo que hay escrito.
          if (!update.isIdle) update.reset();
        }}
        maxLength={MAX_DISPLAY_NAME_LENGTH}
        hint="Con él te saluda la app. La llave de acceso del móvil conserva el nombre con el que la creaste."
      />

      {update.isSuccess && (
        <Notice tone="success" title="Nombre guardado">
          Ya te saluda como {update.data.displayName}.
        </Notice>
      )}
      {update.isError && (
        <Notice tone="danger" title="No se pudo guardar">
          {describeError(update.error)}
        </Notice>
      )}

      <Button type="submit" fullWidth loading={update.isPending} disabled={nameToSave === null}>
        Guardar nombre
      </Button>
    </form>
  );
}
