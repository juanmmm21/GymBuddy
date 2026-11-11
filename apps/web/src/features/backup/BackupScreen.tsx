import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { Button, Notice, Surface } from '../../components/index';
import { describeError } from '../../lib/errors';
import { ExportIntegrityError, type ExportProgress } from './collect-export';
import { ExportSaveError, useExportDownload, type ExportSummary } from './use-export-download';
import { ImportSection } from './ImportSection';
import styles from './BackupScreen.module.css';
import { SETTINGS_PATH } from '../settings/paths';
import { t, plural } from '../../i18n/index';

function backToSettings(): BackLink {
  return { to: SETTINGS_PATH, label: t('Ajustes', 'Settings') };
}

/**
 * La copia de seguridad de todo lo del usuario. Las llaves de acceso viven en los móviles y no
 * se pueden copiar, así que si se pierden todos, este fichero es lo único que queda del historial.
 */
export function BackupScreen() {
  const { download, progress, start } = useExportDownload();

  return (
    <>
      <ScreenHeader
        title={t('Copia de seguridad', 'Backup')}
        subtitle={t('Todo tu entrenamiento en un fichero', 'All your training in one file')}
        backTo={backToSettings()}
      />
      <div className={styles.stack}>
        <Surface as="section">
          <ol className={styles.steps}>
            <li>
              {t(
                'Pulsa «Descargar mis datos» y espera a que termine.',
                'Tap “Download my data” and wait for it to finish.',
              )}
            </li>
            <li>
              {t(
                'Tu móvil guardará un fichero que se llama gymbuddy y la fecha de hoy.',
                'Your phone will save a file named gymbuddy plus today’s date.',
              )}
            </li>
            <li>
              {t(
                'Guárdalo también fuera de este móvil: en tu nube, en tu correo o en el ordenador.',
                'Keep a copy off this phone too: in your cloud, your email or your computer.',
              )}
            </li>
          </ol>
        </Surface>

        <Surface as="section">
          <p className={styles.contents}>
            {t(
              'Lleva tus ejercicios, todas tus sesiones con sus series, tus marcas y tus rutinas. No lleva tus llaves de acceso ni tus invitaciones: esas se quedan en tus móviles.',
              'It contains your exercises, all your sessions with their sets, your records and your routines. It doesn’t contain your passkeys or invitations: those stay on your phones.',
            )}
          </p>
        </Surface>

        {download.isError && (
          <Notice
            tone="danger"
            title={t('No se ha podido descargar la copia', 'The backup couldn’t be downloaded')}
            action={
              <Button variant="secondary" onClick={start}>
                {t('Reintentar', 'Retry')}
              </Button>
            }
          >
            {describeExportError(download.error)}
          </Notice>
        )}

        {download.isSuccess && <ExportDone summary={download.data} />}

        {download.isPending && progress !== null && <ExportProgressLine progress={progress} />}

        <Button
          size="lg"
          fullWidth
          loading={download.isPending}
          variant={download.isSuccess ? 'secondary' : 'primary'}
          onClick={start}
        >
          {download.isSuccess
            ? t('Descargar otra vez', 'Download again')
            : t('Descargar mis datos', 'Download my data')}
        </Button>

        <ImportSection />
      </div>
    </>
  );
}

function ExportProgressLine({ progress }: { readonly progress: ExportProgress }) {
  return (
    <p className={styles.progress} role="status">
      {progress.totalSessions === 0
        ? t('Preparando tus datos…', 'Preparing your data…')
        : t(
            `Preparando sesiones: ${String(progress.loadedSessions)} de ${String(progress.totalSessions)}`,
            `Preparing sessions: ${String(progress.loadedSessions)} of ${String(progress.totalSessions)}`,
          )}
    </p>
  );
}

function ExportDone({ summary }: { readonly summary: ExportSummary }) {
  return (
    <Notice tone="success" title={t('Copia descargada', 'Backup downloaded')}>
      {summary.fileName}:{' '}
      {plural(summary.sessions, ['sesión', 'sesiones'], ['session', 'sessions'])},{' '}
      {plural(summary.exercises, ['ejercicio', 'ejercicios'], ['exercise', 'exercises'])}{' '}
      {t('y', 'and')} {plural(summary.routines, ['rutina', 'rutinas'], ['routine', 'routines'])}.{' '}
      {t(
        'Si no lo encuentras, mira en la carpeta de descargas o en la app Archivos.',
        'If you can’t find it, look in your downloads folder or the Files app.',
      )}
    </Notice>
  );
}

function describeExportError(error: Error): string {
  if (error instanceof ExportSaveError) {
    return t(
      'Este navegador no deja guardar ficheros desde aquí. Abre GymBuddy en Safari o en Chrome y vuelve a intentarlo.',
      'This browser doesn’t allow saving files from here. Open GymBuddy in Safari or Chrome and try again.',
    );
  }
  if (error instanceof ExportIntegrityError) {
    return t(
      'Tus datos han cambiado mientras se preparaba la copia. Vuelve a intentarlo.',
      'Your data changed while the backup was being prepared. Try again.',
    );
  }
  return describeError(error);
}
