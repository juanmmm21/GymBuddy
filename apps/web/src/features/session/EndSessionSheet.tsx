import type {
  Locale,
  PersonalRecord,
  ResourceId,
  TrackedExercise,
  WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useEndSession } from '../../api/mutations';
import { Button, Notice, Sheet, TextArea } from '../../components/index';
import { describeError } from '../../lib/errors';
import { formatVolumeLabel, pluralize } from '../../lib/format';
import { MAX_SESSION_NOTES_LENGTH, normalizeNotes } from '../../lib/notes';
import { bodyPartPath } from '../catalog/paths';
import type { FinalCardioOffer } from './final-cardio';
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
  /** El cardio opcional con el que rematar, que decide `finalCardioOffer`. */
  readonly finalCardio: FinalCardioOffer;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Apuntar el cardio final con ese ejercicio antes de cerrar. */
  readonly onLogFinalCardio: (exerciseId: ResourceId) => void;
  /** Empezar ahora el cardio final, que se apuntará al terminarlo; cierra esta hoja. */
  readonly onStartFinalCardio: () => void;
  readonly onEnded: () => void;
}

/** Cerrar la sesión: primero lo que has hecho, y después el botón que la termina. */
export function EndSessionSheet({
  session,
  records,
  exercises,
  locale,
  finalCardio,
  open,
  onClose,
  onLogFinalCardio,
  onStartFinalCardio,
  onEnded,
}: EndSessionSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Terminar sesión">
      <EndSessionForm
        session={session}
        records={records}
        exercises={exercises}
        locale={locale}
        finalCardio={finalCardio}
        onLogFinalCardio={onLogFinalCardio}
        onStartFinalCardio={onStartFinalCardio}
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
  readonly finalCardio: FinalCardioOffer;
  readonly onLogFinalCardio: (exerciseId: ResourceId) => void;
  readonly onStartFinalCardio: () => void;
  readonly onEnded: () => void;
}

function EndSessionForm({
  session,
  records,
  exercises,
  locale,
  finalCardio,
  onLogFinalCardio,
  onStartFinalCardio,
  onEnded,
}: EndSessionFormProps) {
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
      <FinalCardioPrompt
        offer={finalCardio}
        inProgress={(session.cardioStartedAt ?? null) !== null}
        onLog={onLogFinalCardio}
        onStart={onStartFinalCardio}
      />

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

/**
 * El cardio final es opcional: se ofrece arriba y sin cortar el paso, y quien no lo quiere termina
 * con el botón de siempre. Va delante del resumen porque apuntarlo cambia ese resumen. Se puede
 * empezar ahora —la sesión no se cierra mientras dure— o apuntar uno ya hecho; con uno en marcha,
 * lo que toca es apuntarlo.
 */
function FinalCardioPrompt({
  offer,
  inProgress,
  onLog,
  onStart,
}: {
  readonly offer: FinalCardioOffer;
  readonly inProgress: boolean;
  readonly onLog: (exerciseId: ResourceId) => void;
  readonly onStart: () => void;
}) {
  switch (offer.kind) {
    case 'none':
      return null;
    case 'no_exercise':
      return (
        <Notice
          title="¿Rematas con cardio?"
          action={<Link to={bodyPartPath('cardio')}>Ver cardio en el catálogo</Link>}
        >
          Es opcional. No sigues ningún ejercicio de cardio: sigue uno y podrás apuntarlo aquí.
        </Notice>
      );
    case 'exercise': {
      const log = (
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            onLog(offer.exerciseId);
          }}
        >
          Apuntar cardio
        </Button>
      );

      if (inProgress) {
        return (
          <Notice title="Tu cardio sigue en marcha" action={log}>
            Apúntalo con el tiempo que lleva y vuelves aquí a terminar.
          </Notice>
        );
      }

      return (
        <Notice
          title="¿Rematas con cardio?"
          action={
            <div className={styles.cardioActions}>
              <Button fullWidth onClick={onStart}>
                Empezar cardio ahora
              </Button>
              {log}
            </div>
          }
        >
          Es opcional, esté o no en tu rutina. Empiézalo y la sesión no se cerrará mientras dure; si
          ya lo hiciste, apúntalo con su duración y vuelves aquí a terminar.
        </Notice>
      );
    }
  }
}

function Total({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <li className={styles.total}>
      <span className={styles.totalLabel}>{label}</span>
      <span className={styles.totalValue}>{value}</span>
    </li>
  );
}
