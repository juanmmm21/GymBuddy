import { useId, useState, type ChangeEvent } from 'react';
import { ApiRequestError } from '../../api/client';
import { Button, Notice, Surface } from '../../components/index';
import { describeError } from '../../lib/errors';
import { formatShortDate } from '../../lib/format';
import { readImportFile, summarizeImportFile, type ImportFileReading } from './read-import-file';
import { ImportConflictError, type ImportProgress, type ImportResult } from './run-import';
import { useImportBackup } from './use-import-backup';
import styles from './BackupScreen.module.css';
import { plural, t, useLocale } from '../../i18n/index';

/** Lo elegido en el selector: lo que dijo su lectura, o que ni siquiera se pudo abrir. */
type ChosenFile = ImportFileReading | { readonly status: 'unreadable' };

function phaseLabel(phase: ImportProgress['phase']): string {
  switch (phase) {
    case 'exercises':
      return t('ejercicios', 'exercises');
    case 'routines':
      return t('rutinas', 'routines');
    case 'sessions':
      return t('sesiones', 'sessions');
  }
}

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
          {t('Recuperar desde una copia', 'Restore from a backup')}
        </h2>
        <ol className={styles.steps}>
          <li>
            {t('Elige el fichero gymbuddy que guardaste.', 'Choose the gymbuddy file you saved.')}
          </li>
          <li>
            {t(
              'Revisa lo que trae y pulsa «Recuperar esta copia».',
              'Check what it contains and tap “Restore this backup”.',
            )}
          </li>
          <li>
            {t(
              'Espera a que termine sin cerrar la app. Si se corta, vuelve a pulsar: lo que ya entró no se repite.',
              'Wait for it to finish without closing the app. If it stops, tap again: what already went in isn’t repeated.',
            )}
          </li>
        </ol>
        <label htmlFor={inputId} className={styles.fileLabel}>
          {t('Fichero de la copia', 'Backup file')}
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
        <Notice
          tone="danger"
          title={t('No se ha podido recuperar la copia', 'The backup couldn’t be restored')}
        >
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
          {restore.isError
            ? t('Reintentar', 'Retry')
            : t('Recuperar esta copia', 'Restore this backup')}
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
  const summary = summarizeImportFile(reading.file);
  const locale = useLocale();

  return (
    <Notice
      tone="info"
      title={t(
        `Copia del ${formatShortDate(summary.exportedAt, locale)}`,
        `Backup from ${formatShortDate(summary.exportedAt, locale)}`,
      )}
    >
      <p>
        {plural(summary.exercises, ['ejercicio', 'ejercicios'], ['exercise', 'exercises'])},{' '}
        {plural(summary.sessions, ['sesión', 'sesiones'], ['session', 'sessions'])}{' '}
        {t('con', 'with')} {plural(summary.sets, ['serie', 'series'], ['set', 'sets'])}{' '}
        {t('y', 'and')} {plural(summary.routines, ['rutina', 'rutinas'], ['routine', 'routines'])}.
      </p>
      {summary.openSessions > 0 && (
        <p>
          {t(
            'La sesión que estaba sin cerrar entrará cerrada a la hora de su última serie.',
            'The session that was still open will come in closed at the time of its last set.',
          )}
        </p>
      )}
      <p>
        {t(
          'Se añade a lo que ya tengas en esta cuenta. Tu nombre y tus llaves no cambian.',
          'It’s added to what you already have in this account. Your name and passkeys don’t change.',
        )}
      </p>
    </Notice>
  );
}

function UnusableFileNotice({
  chosen,
}: {
  readonly chosen: Exclude<ChosenFile, { status: 'ready' }>;
}) {
  return (
    <Notice
      tone="danger"
      title={t('Este fichero no se puede recuperar', 'This file can’t be restored')}
    >
      {describeUnusableFile(chosen)}
    </Notice>
  );
}

function ImportProgressLine({ progress }: { readonly progress: ImportProgress }) {
  return (
    <p className={styles.progress} role="status">
      {t(
        `Recuperando ${phaseLabel(progress.phase)}: ${String(progress.done)} de ${String(progress.total)}`,
        `Restoring ${phaseLabel(progress.phase)}: ${String(progress.done)} of ${String(progress.total)}`,
      )}
    </p>
  );
}

function ImportDone({ result }: { readonly result: ImportResult }) {
  return (
    <Notice tone="success" title={t('Copia recuperada', 'Backup restored')}>
      <p>
        {t('Han entrado', 'Restored')}{' '}
        {plural(result.exercises, ['ejercicio', 'ejercicios'], ['exercise', 'exercises'])},{' '}
        {plural(result.sessions, ['sesión', 'sesiones'], ['session', 'sessions'])} {t('y', 'and')}{' '}
        {plural(result.routines, ['rutina', 'rutinas'], ['routine', 'routines'])}.
      </p>
      {result.enteredAsCustom > 0 && (
        <p>
          {plural(
            result.enteredAsCustom,
            ['ejercicio del catálogo ha', 'ejercicios del catálogo han'],
            ['catalogue exercise was', 'catalogue exercises were'],
          )}{' '}
          {t(
            'entrado como propios, con su nombre y su historial, porque el catálogo de esta cuenta todavía no los tiene.',
            'restored as your own, with their name and history, because this account’s catalogue doesn’t have them yet.',
          )}
        </p>
      )}
    </Notice>
  );
}

function describeUnusableFile(chosen: Exclude<ChosenFile, { status: 'ready' }>): string {
  switch (chosen.status) {
    case 'unreadable':
      return t(
        'No se ha podido abrir el fichero. Vuelve a elegirlo.',
        'The file couldn’t be opened. Choose it again.',
      );
    case 'not_json':
    case 'not_gymbuddy':
      return t(
        'No es una copia de GymBuddy. Elige el fichero que empieza por gymbuddy y acaba en .json.',
        'It’s not a GymBuddy backup. Choose the file that starts with gymbuddy and ends in .json.',
      );
    case 'unsupported_version':
      return t(
        'Esta copia es de otra versión de GymBuddy y esta app no sabe leerla. Actualiza la app y vuelve a intentarlo.',
        'This backup is from another version of GymBuddy and this app can’t read it. Update the app and try again.',
      );
    case 'broken':
      return t(
        'La copia está dañada o se ha modificado a mano, y recuperarla dejaría datos a medias.',
        'The backup is damaged or was edited by hand, and restoring it would leave data half-done.',
      );
    case 'too_large':
      return t(
        'La copia trae una sesión o una rutina demasiado grande para subirla de una vez.',
        'The backup contains a session or routine too large to upload in one go.',
      );
  }
}

function describeImportError(error: Error): string {
  if (error instanceof ImportConflictError) {
    return t(
      `Ya sigues ${error.exerciseNames.join(', ')} en esta cuenta, y una copia todavía no se puede mezclar con ejercicios que ya tienes. No se ha escrito nada.`,
      `You already track ${error.exerciseNames.join(', ')} in this account, and a backup can’t be merged with exercises you already have yet. Nothing was written.`,
    );
  }
  if (error instanceof ApiRequestError && error.code === 'import_conflict') {
    return t(
      'Mientras se recuperaba, esta cuenta ha empezado a seguir un ejercicio de la copia. Lo que ya entró se queda; el resto no se puede mezclar todavía.',
      'While restoring, this account started tracking an exercise from the backup. What already went in stays; the rest can’t be merged yet.',
    );
  }
  return `${describeError(error)} ${t(
    'Lo que ya haya entrado no se repetirá al reintentar.',
    'Anything already restored won’t be repeated when you retry.',
  )}`;
}
