import { useId, useState, type ChangeEvent } from 'react';
import { ApiRequestError } from '../../api/client';
import { useSession } from '../../auth/SessionProvider';
import { Button, Notice, Surface } from '../../components/index';
import { describeError } from '../../lib/errors';
import { formatShortDate, pluralize } from '../../lib/format';
import { readImportFile, summarizeImportFile, type ImportFileReading } from './read-import-file';
import { ImportConflictError, type ImportProgress, type ImportResult } from './run-import';
import { useImportBackup } from './use-import-backup';
import styles from './BackupScreen.module.css';

/** Lo elegido en el selector: lo que dijo su lectura, o que ni siquiera se pudo abrir. */
type ChosenFile = ImportFileReading | { readonly status: 'unreadable' };

const PHASE_LABELS: Readonly<Record<ImportProgress['phase'], string>> = {
  exercises: 'ejercicios',
  routines: 'rutinas',
  sessions: 'sesiones',
};

/**
 * Recuperar una copia descargada en esta cuenta. Nada se escribe al elegir el fichero: primero se
 * lee y se enseña lo que trae, y solo al pulsar se sube. Es lo único que queda si se pierden todos
 * los móviles, así que cada fallo dice qué hacer y no solo que algo ha ido mal.
 */
export function ImportSection() {
  const { restore, progress, start } = useImportBackup();
  const [chosen, setChosen] = useState<ChosenFile | null>(null);
  const inputId = useId();
  const titleId = useId();

  const choose = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const selected = event.target.files?.[0];
    restore.reset();
    if (selected === undefined) {
      setChosen(null);
      return;
    }

    try {
      setChosen(readImportFile(await selected.text()));
    } catch (error) {
      console.warn('No se pudo abrir el fichero elegido', error);
      setChosen({ status: 'unreadable' });
    }
  };

  const ready = chosen?.status === 'ready' ? chosen : null;

  return (
    <>
      <Surface as="section" aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.sectionTitle}>
          Recuperar desde una copia
        </h2>
        <ol className={styles.steps}>
          <li>Elige el fichero gymbuddy que guardaste.</li>
          <li>Revisa lo que trae y pulsa «Recuperar esta copia».</li>
          <li>
            Espera a que termine sin cerrar la app. Si se corta, vuelve a pulsar: lo que ya entró no
            se repite.
          </li>
        </ol>
        <label htmlFor={inputId} className={styles.fileLabel}>
          Fichero de la copia
        </label>
        <input
          id={inputId}
          type="file"
          accept=".json,application/json"
          className={styles.fileInput}
          disabled={restore.isPending}
          onChange={(event) => {
            void choose(event);
          }}
        />
      </Surface>

      {chosen !== null && chosen.status !== 'ready' && <UnusableFileNotice chosen={chosen} />}

      {ready !== null && !restore.isSuccess && <ImportPreview reading={ready} />}

      {restore.isError && (
        <Notice tone="danger" title="No se ha podido recuperar la copia">
          {describeImportError(restore.error)}
        </Notice>
      )}

      {restore.isSuccess && <ImportDone result={restore.data} />}

      {restore.isPending && progress !== null && <ImportProgressLine progress={progress} />}

      {ready !== null && !restore.isSuccess && (
        <Button
          size="lg"
          fullWidth
          loading={restore.isPending}
          onClick={() => {
            start({ file: ready.file, plan: ready.plan });
          }}
        >
          {restore.isError ? 'Reintentar' : 'Recuperar esta copia'}
        </Button>
      )}
    </>
  );
}

function ImportPreview({
  reading,
}: {
  readonly reading: Extract<ImportFileReading, { status: 'ready' }>;
}) {
  const { session } = useSession();
  const summary = summarizeImportFile(reading.file);
  const locale = session?.user.locale ?? 'es';

  return (
    <Notice tone="info" title={`Copia del ${formatShortDate(summary.exportedAt, locale)}`}>
      <p>
        {pluralize(summary.exercises, 'ejercicio', 'ejercicios')},{' '}
        {pluralize(summary.sessions, 'sesión', 'sesiones')} con{' '}
        {pluralize(summary.sets, 'serie', 'series')} y{' '}
        {pluralize(summary.routines, 'rutina', 'rutinas')}.
      </p>
      {summary.openSessions > 0 && (
        <p>La sesión que estaba sin cerrar entrará cerrada a la hora de su última serie.</p>
      )}
      <p>Se añade a lo que ya tengas en esta cuenta. Tu nombre y tus llaves no cambian.</p>
    </Notice>
  );
}

function UnusableFileNotice({
  chosen,
}: {
  readonly chosen: Exclude<ChosenFile, { status: 'ready' }>;
}) {
  return (
    <Notice tone="danger" title="Este fichero no se puede recuperar">
      {describeUnusableFile(chosen)}
    </Notice>
  );
}

function ImportProgressLine({ progress }: { readonly progress: ImportProgress }) {
  return (
    <p className={styles.progress} role="status">
      Recuperando {PHASE_LABELS[progress.phase]}: {String(progress.done)} de{' '}
      {String(progress.total)}
    </p>
  );
}

function ImportDone({ result }: { readonly result: ImportResult }) {
  return (
    <Notice tone="success" title="Copia recuperada">
      <p>
        Han entrado {pluralize(result.exercises, 'ejercicio', 'ejercicios')},{' '}
        {pluralize(result.sessions, 'sesión', 'sesiones')} y{' '}
        {pluralize(result.routines, 'rutina', 'rutinas')}.
      </p>
      {result.enteredAsCustom > 0 && (
        <p>
          {pluralize(
            result.enteredAsCustom,
            'ejercicio del catálogo ha',
            'ejercicios del catálogo han',
          )}{' '}
          entrado como propios, con su nombre y su historial, porque el catálogo de esta cuenta
          todavía no los tiene.
        </p>
      )}
    </Notice>
  );
}

function describeUnusableFile(chosen: Exclude<ChosenFile, { status: 'ready' }>): string {
  switch (chosen.status) {
    case 'unreadable':
      return 'No se ha podido abrir el fichero. Vuelve a elegirlo.';
    case 'not_json':
    case 'not_gymbuddy':
      return 'No es una copia de GymBuddy. Elige el fichero que empieza por gymbuddy y acaba en .json.';
    case 'unsupported_version':
      return 'Esta copia es de otra versión de GymBuddy y esta app no sabe leerla. Actualiza la app y vuelve a intentarlo.';
    case 'broken':
      return 'La copia está dañada o se ha modificado a mano, y recuperarla dejaría datos a medias.';
    case 'too_large':
      return 'La copia trae una sesión o una rutina demasiado grande para subirla de una vez.';
  }
}

function describeImportError(error: Error): string {
  if (error instanceof ImportConflictError) {
    return `Ya sigues ${error.exerciseNames.join(', ')} en esta cuenta, y una copia todavía no se puede mezclar con ejercicios que ya tienes. No se ha escrito nada.`;
  }
  if (error instanceof ApiRequestError && error.code === 'import_conflict') {
    return 'Mientras se recuperaba, esta cuenta ha empezado a seguir un ejercicio de la copia. Lo que ya entró se queda; el resto no se puede mezclar todavía.';
  }
  return `${describeError(error)} Lo que ya haya entrado no se repetirá al reintentar.`;
}
