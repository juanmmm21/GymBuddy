import type {
  Locale,
  PersonalRecord,
  TrackedExercise,
  WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { useEndSession } from '../../api/mutations';
import { Button, Notice, Sheet, TextArea } from '../../components/index';
import { describeError } from '../../lib/errors';
import { formatVolumeLabel, pluralize } from '../../lib/format';
import { MAX_SESSION_NOTES_LENGTH, normalizeNotes } from '../../lib/notes';
import { SessionRecordItems } from './SessionRecordItems';
import { summarizeSession } from './summary';
import styles from './EndSessionSheet.module.css';

export interface EndSessionSheetProps {
  readonly session: WorkoutSessionDetail;
  /** Las marcas rotas durante esta sesión, ya con una sola por ejercicio y tipo. */
  readonly records: readonly PersonalRecord[];
  /** Para nombrar el ejercicio de cada marca; con los archivados. */
  readonly exercises: readonly TrackedExercise[];
  readonly locale: Locale;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onEnded: () => void;
}

/** Cerrar la sesión: primero lo que has hecho, y después el botón que la termina. */
export function EndSessionSheet({
  session,
  records,
  exercises,
  locale,
  open,
  onClose,
  onEnded,
}: EndSessionSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Terminar sesión">
      <EndSessionForm
        session={session}
        records={records}
        exercises={exercises}
        locale={locale}
        onEnded={onEnded}
      />
    </Sheet>
  );
}

interface EndSessionFormProps {
  readonly session: WorkoutSessionDetail;
  readonly records: readonly PersonalRecord[];
  readonly exercises: readonly TrackedExercise[];
  readonly locale: Locale;
  readonly onEnded: () => void;
}

function EndSessionForm({ session, records, exercises, locale, onEnded }: EndSessionFormProps) {
  const [notes, setNotes] = useState(session.notes ?? '');
  const end = useEndSession();
  const totals = summarizeSession(session.sets);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    end.mutate(
      { sessionId: session.id, body: { notes: normalizeNotes(notes) } },
      { onSuccess: onEnded },
    );
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <ul className={styles.totals}>
        <Total label="Series" value={String(totals.setCount)} />
        <Total label="Ejercicios" value={String(totals.exerciseCount)} />
        <Total label="Volumen" value={formatVolumeLabel(totals.volumeGrams, locale)} />
      </ul>

      {totals.setCount === 0 && (
        <Notice title="Sesión sin series">
          Se cerrará vacía y no contará para tu peso habitual ni para tus marcas.
        </Notice>
      )}

      {records.length > 0 && (
        <Notice tone="success" title={pluralize(records.length, 'marca nueva', 'marcas nuevas')}>
          <ul className={styles.records}>
            <SessionRecordItems records={records} exercises={exercises} locale={locale} />
          </ul>
        </Notice>
      )}

      <TextArea
        label="Notas de la sesión"
        value={notes}
        onChange={setNotes}
        maxLength={MAX_SESSION_NOTES_LENGTH}
        placeholder="Cómo fue, cómo te encontraste, qué cambiar la próxima vez."
      />

      {end.isError && (
        <Notice tone="danger" title="No se pudo terminar">
          {describeError(end.error)}
        </Notice>
      )}

      <Button type="submit" size="lg" fullWidth loading={end.isPending}>
        Terminar sesión
      </Button>
    </form>
  );
}

function Total({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <li className={styles.total}>
      <span className={styles.totalLabel}>{label}</span>
      <span className={styles.totalValue}>{value}</span>
    </li>
  );
}
